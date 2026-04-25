use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use chrono::{Local, TimeZone, Utc};
use czkawka_core::common::image::check_if_can_display_image;
use image::ImageFormat;
use log::error;
use slint::{ComponentHandle, Model, SharedString};

use crate::common::{StrDataDuplicateFiles, StrDataSimilarImages, StrDataSimilarMusic, StrDataSimilarVideos, StrDataVideoOptimizer};
use std::sync::RwLock;
use crate::shared_models::SharedModels;
use crate::{ActiveTab, Callabler, GuiState, MainWindow, PreviewMetadata};

/// Registers the `on_load_metadata_for_row` callback that reads model data.
pub(crate) fn connect_load_metadata_for_row(app: &MainWindow, _shared_models: Arc<RwLock<SharedModels>>) {
    let a = app.as_weak();
    app.global::<Callabler>().on_load_metadata_for_row(move |idx| {
        let app = a.upgrade().expect("Failed to upgrade app in load_metadata_for_row");
        let active_tab = app.global::<GuiState>().get_active_tab();
        let model = active_tab.get_tool_model(&app);

        let idx = idx as usize;
        if idx >= model.row_count() {
            return;
        }
        let row = match model.row_data(idx) {
            Some(r) => r,
            None => return,
        };
        if row.header_row {
            return;
        }

        let gui_state = app.global::<GuiState>();
        let mut meta = PreviewMetadata::default();

        // Basic file info from val_str columns
        let path_idx = active_tab.get_str_path_idx();
        let name_idx = active_tab.get_str_name_idx();
        let val_strs: Vec<SharedString> = row.val_str.iter().collect();

        if let Some(name) = val_strs.get(name_idx) {
            meta.file_name = name.clone();
        }
        if let Some(path) = val_strs.get(path_idx) {
            meta.file_path = path.clone();
        }

        // Tab-specific metadata from model data
        match active_tab {
            ActiveTab::SimilarVideos => {
                if let Some(s) = val_strs.get(StrDataSimilarVideos::Size as usize) {
                    meta.file_size = s.clone();
                }
                if let Some(d) = val_strs.get(StrDataSimilarVideos::Dimensions as usize) {
                    meta.video_dimensions = d.clone();
                }
                if let Some(d) = val_strs.get(StrDataSimilarVideos::Duration as usize) {
                    meta.video_duration = d.clone();
                }
                if let Some(b) = val_strs.get(StrDataSimilarVideos::Bitrate as usize) {
                    meta.video_bitrate = b.clone();
                }
                if let Some(f) = val_strs.get(StrDataSimilarVideos::Fps as usize) {
                    meta.video_fps = f.clone();
                }
                if let Some(c) = val_strs.get(StrDataSimilarVideos::Codec as usize) {
                    meta.video_codec = c.clone();
                }
                if let Some(m) = val_strs.get(StrDataSimilarVideos::ModificationDate as usize) {
                    meta.file_modified = m.clone();
                }
            }
            ActiveTab::SimilarMusic => {
                if let Some(s) = val_strs.get(StrDataSimilarMusic::Size as usize) {
                    meta.file_size = s.clone();
                }
                if let Some(t) = val_strs.get(StrDataSimilarMusic::Title as usize) {
                    if !t.is_empty() {
                        meta.audio_title = t.clone();
                    }
                }
                if let Some(a) = val_strs.get(StrDataSimilarMusic::Artist as usize) {
                    if !a.is_empty() {
                        meta.audio_artist = a.clone();
                    }
                }
                if let Some(y) = val_strs.get(StrDataSimilarMusic::Year as usize) {
                    if !y.is_empty() {
                        meta.audio_year = y.clone();
                    }
                }
                if let Some(b) = val_strs.get(StrDataSimilarMusic::Bitrate as usize) {
                    if !b.is_empty() {
                        meta.audio_bitrate = b.clone();
                    }
                }
                if let Some(l) = val_strs.get(StrDataSimilarMusic::Length as usize) {
                    if !l.is_empty() {
                        meta.audio_length = l.clone();
                    }
                }
                if let Some(g) = val_strs.get(StrDataSimilarMusic::Genre as usize) {
                    if !g.is_empty() {
                        meta.audio_genre = g.clone();
                    }
                }
                if let Some(m) = val_strs.get(StrDataSimilarMusic::ModificationDate as usize) {
                    meta.file_modified = m.clone();
                }
            }
            ActiveTab::DuplicateFiles => {
                if let Some(s) = val_strs.get(StrDataDuplicateFiles::Size as usize) {
                    meta.file_size = s.clone();
                }
                if let Some(m) = val_strs.get(StrDataDuplicateFiles::ModificationDate as usize) {
                    meta.file_modified = m.clone();
                }
            }
            ActiveTab::SimilarImages => {
                if let Some(s) = val_strs.get(StrDataSimilarImages::Size as usize) {
                    meta.file_size = s.clone();
                }
                if let Some(m) = val_strs.get(StrDataSimilarImages::ModificationDate as usize) {
                    meta.file_modified = m.clone();
                }
            }
            ActiveTab::VideoOptimizer => {
                if let Some(s) = val_strs.get(StrDataVideoOptimizer::Size as usize) {
                    meta.file_size = s.clone();
                }
                if let Some(c) = val_strs.get(StrDataVideoOptimizer::Codec as usize) {
                    if !c.is_empty() {
                        meta.video_codec = c.clone();
                    }
                }
                if let Some(m) = val_strs.get(StrDataVideoOptimizer::ModificationDate as usize) {
                    meta.file_modified = m.clone();
                }
            }
            _ => {
                if !val_strs.is_empty() {
                    meta.file_size = val_strs[0].clone();
                }
            }
        }

        gui_state.set_preview_metadata(meta);
    });
}

/// Extracts basic file metadata (size, date) from the filesystem as fallback.
pub(crate) fn load_file_metadata(app: &MainWindow, file_path: &str) {
    let path = Path::new(file_path);
    let gui_state = app.global::<GuiState>();

    let mut meta = gui_state.get_preview_metadata();

    if meta.file_name.is_empty() {
        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
            meta.file_name = file_name.into();
        }
    }
    if meta.file_path.is_empty() {
        if let Some(parent) = path.parent().and_then(|p| p.to_str()) {
            meta.file_path = parent.into();
        }
    }

    // File size and modification date from fs::Metadata (fallback if model didn't fill them)
    if meta.file_size.is_empty() || meta.file_modified.is_empty() {
        if let Ok(metadata) = fs::metadata(path) {
            if meta.file_size.is_empty() {
                let size = metadata.len();
                meta.file_size = SharedString::from(humansize::format_size(size, humansize::BINARY));
            }
            if meta.file_modified.is_empty() {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
                        let timestamp = duration.as_secs();
                        let dt_local = Utc
                            .timestamp_opt(timestamp as i64, 0)
                            .single()
                            .unwrap_or_default()
                            .with_timezone(&Local);
                        meta.file_modified = SharedString::from(dt_local.format("%Y-%m-%d %H:%M:%S").to_string());
                    }
                }
            }
        }
    }

    // Image-specific: dimensions and format from image crate
    if meta.image_dimensions.is_empty() && meta.image_format.is_empty() {
        if check_if_can_display_image(file_path) {
            if let Ok(m) = fs::metadata(path)
                && m.is_file()
                && m.len() > 0
            {
                load_image_metadata(path, &mut meta);
            }
        }
    }

    gui_state.set_preview_metadata(meta);
}

fn load_image_metadata(path: &Path, meta: &mut PreviewMetadata) {
    match image::image_dimensions(path) {
        Ok((w, h)) => {
            meta.image_dimensions = SharedString::from(format!("{w} × {h} px"));
        }
        Err(e) => {
            error!("Failed to get image dimensions for \"{}\": {e}", path.to_string_lossy());
        }
    }

    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let format_name = match ImageFormat::from_extension(ext) {
            Some(f) => format!("{:?}", f).to_uppercase(),
            None => ext.to_uppercase(),
        };
        meta.image_format = SharedString::from(format_name);
    }
}
