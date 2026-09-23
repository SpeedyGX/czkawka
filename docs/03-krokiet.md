# krokiet — The Primary Slint Desktop GUI for Czkawka

**Version:** 11.0.1  
**License:** GPL-3.0-only  
**Min Rust:** 1.92.0, edition 2024  
**Framework:** [Slint](https://slint.dev/) 1.17.0
**Source:** [`krokiet/`](../krokiet)

---

## 1. Overview

`krokiet` is the primary desktop GUI for Czkawka, built with the **Slint** declarative UI framework. It provides a rich, multi-tool interface for finding and managing duplicate files, similar images/videos/music, empty folders/files, temporary files, broken files, bad extensions/names, invalid symlinks, EXIF data, and video optimization.

The architecture follows a **callback-driven** pattern: the Slint UI (`.slint` files) declares callbacks, and Rust code (`src/*.rs`) connects handlers to those callbacks at startup. Scan results are stored as `ModelRc<VecModel<SingleMainListModel>>` — flat, index-based row representations with string and integer column vectors.

---

## 2. Dependencies ([`krokiet/Cargo.toml`](../krokiet/Cargo.toml))

| Dependency | Version | Purpose |
|---|---|---|
| `czkawka_core` | 11.0.1 | Scanning engine (path = `../czkawka_core`) |
| `slint` | 1.17.0 | Declarative UI framework (winit backend, no default features) |
| `chrono` | 0.4.38 | Date/time formatting |
| `open` | 5.3 | Opening files/folders in OS file manager |
| `crossbeam-channel` | 0.5 | Inter-thread progress communication |
| `rfd` | 0.17 | Native file dialogs (xdg-portal) |
| `home` | 0.5 | Home directory detection |
| `log` | 0.4.22 | Logging |
| `serde` / `serde_json` | 1.0 | Settings serialization/deserialization |
| `humansize` | 2.1 | Human-readable file sizes |
| `image` | 0.25 | Image loading (jpeg, png) |
| `rayon` | 1.10 | Parallel sorting and processing |
| `fs_extra` | 1.3 | File operations (marked for replacement) |
| `num_enum` | 0.7.5 | `TryFromPrimitive` for enum-index mapping |
| `regex` | 1.11 | Regex validation for custom select filters |
| `copypasta` | 0.10 | Clipboard access |
| `i18n-embed` / `i18n-embed-fl` / `rust-embed` | — | Fluent translation loading |
| `rodio` | 0.22.0 | Audio playback (optional, `audio` feature) |
| `notify-rust` | 4 | Desktop notifications |
| `fontique` | 0.8.0 | Font loading (dlopen for cross-compilation) |

### Feature Flags

- **`audio`** — enables `rodio` for scan-completion sound
- **Renderers:** `skia_opengl`, `skia_vulkan`, `software`, `femtovg`, `winit_femtovg`, `winit_skia_opengl`, `winit_skia_vulkan`, `winit_software`, `femtovg_wgpu`
- **Image formats:** `heif`, `libraw`, `libavif` (passed through to `czkawka_core`)
- **`xdg_portal_trash`** — trash via xdg-portal (flatpak)

---

## 3. Build Script ([`krokiet/build.rs`](../krokiet/build.rs))

Compiles the main Slint file using `slint_build`. If the `SLINT_STYLE` env var is unset/empty, defaults to `"fluent-dark"`; otherwise uses whatever style is specified.

---

## 4. Entry Point — [`src/main.rs`](../krokiet/src/main.rs)

### Initialization Flow

1. **`register_image_decoding_hooks()`** — registers custom image format hooks
2. **`set_config_cache_path("Czkawka", "Krokiet")`** — sets the cache/config directory
3. **`process_cli_args(...)`** — parses CLI arguments (included/excluded/referenced paths)
4. **Load settings** from JSON files (`BasicSettings` from `config_general.json`, `SettingsCustom` from `config_preset_N.json`)
5. **Set `SLINT_SCALE_FACTOR`** if manual scaling is enabled
6. **`setup_logger(...)`** — initializes logging
7. **`create_default_settings_files()`** — creates default config files if missing
8. **`MainWindow::new()`** — creates the main Slint window (panics with dialog on failure)
9. **Configure features:** sets `audio_feature_enabled` and `notifications_feature_enabled` on `GuiState`
10. **Create `progress_sender/receiver`** (crossbeam channel) and `stop_flag` (AtomicBool)
11. **`zeroing_all_models(&app)`** — initializes all result models to empty `VecModel`s
12. **`SharedModels::new_shared()`** — creates `Arc<RwLock<SharedModels>>` for cross-thread scan state
13. **`AudioPlayer::new()`** — creates audio player for scan completion notifications
14. **`set_initial_gui_infos(&app)`** — asserts combo-box model sync with Slint
15. **`set_initial_scroll_list_data_indexes(&app)`** — sets column index metadata
16. **`set_initial_settings_to_gui(...)`** — applies loaded settings to Slint globals
17. **`update_available_hardware_encoders(&app)`** — background probes HW encoders
18. **Wire all callbacks** — ~27 `connect_*` functions
19. **`clear_outdated_video_thumbnails()`** — background cleanup of old thumbnails
20. **`app.invoke_initialize_popup_sizes()`** — pre-measures popups to avoid layout shifts
21. **`app.run()`** — starts the Slint event loop
22. **On exit:** `save_all_settings_to_file()` — persists settings

### Module Declarations

The file declares all modules and wraps `slint::include_modules!()` in a sub-module to apply crate-level clippy allows to generated code.

---

## 5. Translation — [`src/localizer_krokiet.rs`](../krokiet/src/localizer_krokiet.rs)

### `flk!` Macro

```rust
#[macro_export]
macro_rules! flk {
    ( $($tt:tt)* ) => {{
        i18n_embed_fl::fl!($crate::localizer_krokiet::LANGUAGE_LOADER_KROKIET, $($tt)*)
    }};
}
```

Uses `LazyLock<FluentLanguageLoader>` with `rust-embed` to load translations from the `i18n/` directory at compile time. The `localizer_krokiet()` function returns a `Box<dyn Localizer>` for runtime language switching.

---

## 6. Shared Models — [`src/shared_models.rs`](../krokiet/src/shared_models.rs)

```rust
pub struct SharedModels {
    pub shared_duplication_state: Option<DuplicateFinder>,
    pub shared_empty_folders_state: Option<EmptyFolder>,
    pub shared_empty_files_state: Option<EmptyFiles>,
    pub shared_temporary_files_state: Option<Temporary>,
    pub shared_big_files_state: Option<BigFile>,
    pub shared_similar_images_state: Option<SimilarImages>,
    pub shared_similar_videos_state: Option<SimilarVideos>,
    pub shared_same_music_state: Option<SameMusic>,
    pub shared_same_invalid_symlinks: Option<InvalidSymlinks>,
    pub shared_broken_files_state: Option<BrokenFiles>,
    pub shared_bad_extensions_state: Option<BadExtensions>,
    pub shared_bad_names_state: Option<BadNames>,
    pub shared_exif_remover_state: Option<ExifRemover>,
    pub shared_video_optimizer_state: Option<VideoOptimizer>,
}
```

Holds `Option<...>` for each tool's scan result. Created via `new_shared()` as `Arc<RwLock<Self>>`. Used by:
- **Scan completion:** writes the tool instance after scan finishes
- **`save_results()`:** delegates to the tool's `save_all_in_one()` method
- **`get_use_reference_folders()`:** checks if the tool uses reference folders

---

## 7. Column Index Constants — [`src/common.rs`](../krokiet/src/common.rs)

Defines **enums** and **max constants** for each tool's str/int column layout. Since Slint doesn't support `u64`, integer values that exceed `i32` range are split into two `i32` values.

### Key Utilities

- [`split_u64_into_i32s(value)`](../krokiet/src/common.rs:575) — splits `u64` into `(i32, i32)` (high/low 32 bits)
- [`connect_i32_into_u64(part1, part2)`](../krokiet/src/common.rs:581) — recombines two `i32` into `u64`
- [`create_included_paths_model_from_pathbuf()`](../krokiet/src/common.rs:532) — creates `ModelRc<IncludedPathsModel>` from path lists
- [`ActiveTab::get_str_int_sort_idx()`](../krokiet/src/common.rs:358) — maps column index to sort key type (`SortIdx`)

### Tool Column Enums

| Tool | Str Enum | Int Enum |
|---|---|---|
| Duplicate Files | [`StrDataDuplicateFiles`](../krokiet/src/common.rs:27) | [`IntDataDuplicateFiles`](../krokiet/src/common.rs:15) |
| Empty Folders | [`StrDataEmptyFolders`](../krokiet/src/common.rs:47) | [`IntDataEmptyFolders`](../krokiet/src/common.rs:39) |
| Big Files | [`StrDataBigFiles`](../krokiet/src/common.rs:66) | [`IntDataBigFiles`](../krokiet/src/common.rs:56) |
| Empty Files | [`StrDataEmptyFiles`](../krokiet/src/common.rs:87) | [`IntDataEmptyFiles`](../krokiet/src/common.rs:77) |
| Temporary Files | [`StrDataTemporaryFiles`](../krokiet/src/common.rs:106) | [`IntDataTemporaryFiles`](../krokiet/src/common.rs:96) |
| Similar Images | [`StrDataSimilarImages`](../krokiet/src/common.rs:132) | [`IntDataSimilarImages`](../krokiet/src/common.rs:116) |
| Similar Videos | [`StrDataSimilarVideos`](../krokiet/src/common.rs:164) | [`IntDataSimilarVideos`](../krokiet/src/common.rs:146) |
| Similar Music | [`StrDataSimilarMusic`](../krokiet/src/common.rs:195) | [`IntDataSimilarMusic`](../krokiet/src/common.rs:183) |
| Invalid Symlinks | [`StrDataInvalidSymlinks`](../krokiet/src/common.rs:220) | [`IntDataInvalidSymlinks`](../krokiet/src/common.rs:212) |
| Broken Files | [`StrDataBrokenFiles`](../krokiet/src/common.rs:242) | [`IntDataBrokenFiles`](../krokiet/src/common.rs:232) |
| Bad Extensions | [`StrDataBadExtensions`](../krokiet/src/common.rs:263) | [`IntDataBadExtensions`](../krokiet/src/common.rs:253) |
| Bad Names | [`StrDataBadNames`](../krokiet/src/common.rs:285) | [`IntDataBadNames`](../krokiet/src/common.rs:275) |
| Exif Remover | [`StrDataExifRemover`](../krokiet/src/common.rs:306) | [`IntDataExifRemover`](../krokiet/src/common.rs:295) |
| Video Optimizer | [`StrDataVideoOptimizer`](../krokiet/src/common.rs:338) | [`IntDataVideoOptimizer`](../krokiet/src/common.rs:320) |

---

## 8. Model Layer — [`src/simpler_model.rs`](../krokiet/src/simpler_model.rs)

### `SimplerSingleMainListModel`

A **Send + Sync** version of the Slint `SingleMainListModel`, enabling model manipulation on background threads:

```rust
pub struct SimplerSingleMainListModel {
    pub checked: bool,
    pub filled_header_row: bool,
    pub header_row: bool,
    pub selected_row: bool,
    pub is_source: bool,
    pub is_hardlinked: bool,
    pub val_int: Vec<i32>,
    pub val_str: Vec<String>,
}
```

### Key Traits

- **`ToSimplerVec`** — converts `ModelRc<SingleMainListModel>` to `Vec<(usize, SimplerSingleMainListModel)>`
- **`ToSlintModel`** — converts `Vec<SimplerSingleMainListModel>` back to `Vec<SingleMainListModel>`

---

## 9. Active Tab Metadata — [`src/active_tab_meta.rs`](../krokiet/src/active_tab_meta.rs)

Replaces repetitive 14-arm `match` blocks with a lookup table. Each `ActiveTab` variant maps to `(str_path_idx, str_name_idx, int_date_idx, int_size_opt, is_header_mode)`.

### Key Methods on `ActiveTab`

- [`get_str_path_idx()`](../krokiet/src/active_tab_meta.rs:65) — path column index
- [`get_str_name_idx()`](../krokiet/src/active_tab_meta.rs:69) — name column index
- [`get_int_modification_date_idx()`](../krokiet/src/active_tab_meta.rs:73) — modification date column index
- [`get_int_size_idx()`](../krokiet/src/active_tab_meta.rs:81) — size column index
- [`get_is_header_mode()`](../krokiet/src/active_tab_meta.rs:86) — whether the tool uses grouped display (true for Duplicates, SimilarImages, SimilarVideos, SimilarMusic)
- [`get_tool_model()`](../krokiet/src/active_tab_meta.rs:90) — retrieves the model for the active tab
- [`set_tool_model()`](../krokiet/src/active_tab_meta.rs:110) — sets the model for the active tab

---

## 10. Connection Files — All `connect_*.rs`

### [`connect_scan.rs`](../krokiet/src/connect_scan.rs)

**Purpose:** Scan orchestration.

- Registers the `on_scan_starting` callback
- Validates included paths are present and not all referenced
- Collects settings (`SettingsCustom`, `BasicSettings`, `ComboBoxItems`)
- Creates a `ScanData` struct and dispatches to the appropriate tool-specific scan function
- Common utilities: `get_dt_timestamp_string()`, `insert_data_to_model()`, `get_text_messages()`, `set_common_settings()`

**`ScanData`** struct (line 52):
```rust
pub struct ScanData {
    pub progress_sender: Sender<ProgressData>,
    pub stop_flag: Arc<AtomicBool>,
    pub custom_settings: SettingsCustom,
    pub basic_settings: BasicSettings,
    pub combo_box_items: ComboBoxItems,
    pub shared_models: Arc<RwLock<SharedModels>>,
    pub audio_player: Arc<AudioPlayer>,
}
```

### [`connect_compare.rs`](../krokiet/src/connect_compare.rs)

**Purpose:** Image comparison for similar images.

- `connect_compare_open()` — opens image compare mode for the current group
- `connect_compare_set_left/right()` — sets left/right images
- `connect_compare_toggle_checkbox()` — toggles checked state (syncs with main model)
- `connect_compare_next_group/prev_group()` — navigates between groups
- `connect_compare_swap()` — swaps left/right images
- `connect_compare_cancel_load()` — cancels thumbnail loading
- `connect_compare_compute_diff()` — computes pixel-diff image between two images
- `open_group()` — loads all items in a group into `CompareImageData` model
- Uses thread-local cancel tokens and generation counters for stale computation prevention

### [`connect_show_confirmation.rs`](../krokiet/src/connect_show_confirmation.rs)

**Purpose:** Action confirmation popup setup.

- Registers `on_request_setup_action_popup` callback
- Handles all `PopupRequest` variants: Delete, Trash, Move, OptimizeVideo, CleanExif, Symlink, Hardlink, RenameBadExtension, RenameBadFileName, Save
- For Move: opens a native folder picker dialog, then shows confirmation
- For OptimizeVideo: determines whether crop or transcode mode
- Computes checked item counts and group statistics for confirmation messages

### [`connect_filter.rs`](../krokiet/src/connect_filter.rs)

**Purpose:** Live results filtering.

- Uses LRU cache (max 2 entries) of unfiltered models per `ActiveTab`
- Filters by file name (column 0) or path (column 1)
- Header rows are always kept
- `clear_filter_cache()` clears cache when new scan data is loaded

### [`connect_sort.rs`](../krokiet/src/connect_sort.rs)

**Purpose:** Column-click sorting and sort mode selection.

- `connect_sort_column()` — sorts by clicked column (str, int, int-pair, or selection)
- `connect_sort()` — registers sort mode callbacks (FullName, Selection, Reverse)
- Sort functions handle grouped (header-mode) and flat models differently
- Groups are reversed/flattened independently

### [`connect_save.rs`](../krokiet/src/connect_save.rs)

**Purpose:** Save scan results to disk.

- Opens native folder picker, then calls `shared_models.save_results()`

### [`connect_stop.rs`](../krokiet/src/connect_stop.rs)

**Purpose:** Stop the current scan.

- Sets `stop_flag` to `true` (trivially simple)

### [`connect_tab_changed.rs`](../krokiet/src/connect_tab_changed.rs)

**Purpose:** Tab switch handling.

- Updates select and sort button lists
- If switching to Settings tab, requests cache size calculation

### [`connect_progress_receiver.rs`](../krokiet/src/connect_progress_receiver.rs)

**Purpose:** Progress bar updates.

- Runs a background thread that receives `ProgressData` from the crossbeam channel
- Three modes: `progress_collect_items()` (initial file scanning), `progress_save_load_cache()` (cache operations), `progress_default()` (hashing, comparing, file operations)
- Updates `app.set_progress_datas()` which drives the Slint progress bar

### [`connect_directories_changes.rs`](../krokiet/src/connect_directories_changes.rs)

**Purpose:** Directory path management.

- `connect_add_directories()` — native folder picker
- `connect_add_files()` — native file picker
- `connect_remove_directories()` — removes path by index
- `connect_add_manual_directories()` — adds paths from text input
- Deduplicates paths and sorts them alphabetically

### [`connect_open.rs`](../krokiet/src/connect_open.rs)

**Purpose:** Open config/cache folders and external links.

- `on_open_config_folder` — opens config directory via `open::that()`
- `on_open_cache_folder` — opens cache directory
- `on_open_link` — opens URLs

### [`connect_metadata.rs`](../krokiet/src/connect_metadata.rs)

**Purpose:** File metadata for preview panel.

- `connect_load_metadata_for_row()` — reads metadata from model data (tab-specific)
- `load_file_metadata()` — fallback metadata from filesystem (`fs::metadata`)
- `load_image_metadata()` — image dimensions and format via `image::image_dimensions()`

### [`connect_clean_cache.rs`](../krokiet/src/connect_clean_cache.rs)

**Purpose:** Cache cleaning UI.

- Registers `on_start_cache_cleaning` and `on_stop_cache_cleaning`
- Spawns a thread to run `clean_all_cache_files()` with progress reporting
- Updates `CacheCleaningProgress` and `CacheCleaningResult` in GuiState

### [`connect_row_selection.rs`](../krokiet/src/connect_row_selection.rs)

**Purpose:** Row selection (click, Ctrl+click, Shift+click, Ctrl+A, Space).

- Maintains `SelectionData` per `ActiveTab` in a global `HashMap` protected by `RwLock`
- Optimized: uses "one-by-one" updates for small selections, full model replacement for large ones
- `SELECTED_ROWS_LIMIT = 1000` — beyond this, uses full model replacement
- Contains sub-modules: `selection` (LMB/CTRL/SHIFT), `opener` (open file/parent), `checker` (checked item counts), `context_menu` (right-click actions)
- Context menu actions: remove from results, remove all from folder (recursive), select all from folder (recursive), exclude parent folder, exclude item, copy file name/path/full path, set as source

### [`connect_show_preview.rs`](../krokiet/src/connect_show_preview.rs)

**Purpose:** Image/video preview panel.

- Loads and displays image previews (resized to 1024x1024 max)
- For video files in non-video tabs: generates/retrieves cached video thumbnails via ffmpeg/ffprobe
- Draws crop rectangles on VideoOptimizer previews
- Supports multi-tile thumbnail grids for video optimizer

### [`connect_rfd.rs`](../krokiet/src/connect_rfd.rs)

**Purpose:** Native file dialog overlay management.

- `show_file_dialog_overlay()` — sets `file_dialog_open = true` (shows blocking overlay)
- `hide_file_dialog_overlay()` — sets `file_dialog_open = false` (hides overlay)

### [`connect_translation.rs`](../krokiet/src/connect_translation.rs)

**Purpose:** Translation switching.

- Defines `LANGUAGE_LIST` with 27 languages
- `connect_translations()` — registers language change callback
- `change_language()` — loads Fluent localizers and calls `translate_items()`
- `translate_items()` — sets all `Translations` global properties (~460 lines of string assignments)
- `translate_select_mode()` / `translate_sort_mode()` — maps enum variants to translated strings

---

## 11. Scan Tool Implementations — [`src/connect_scan/`](../krokiet/src/connect_scan)

Each tool follows the same pattern:

1. **Spawn a thread** with `DEFAULT_THREAD_SIZE` stack size
2. **Build parameters** from `ScanData.custom_settings` and `ScanData.comboBox_items`
3. **Create tool struct** (e.g., `DuplicateFinder::new(params)`)
4. **Call `set_common_settings()`** — sets paths, extensions, cache options
5. **Call `tool.search()`** with stop flag and progress sender
6. **Get results** (with optional reference folder handling)
7. **Sort results** using `rayon::par_sort_unstable_by*`
8. **Store tool** in `shared_models` (write lock)
9. **Upgrade to event loop** and call `write_*_results()`
10. **Build model** from vector of entries using `insert_data_to_model()`
11. **Set model** on app (e.g., `app.set_duplicate_files_model()`)
12. **Show result** message via `app.invoke_scan_ended()`
13. **Reset selection** at end

### Tool Details

| File | Tool | Key Parameters | Grouped? |
|---|---|---|---|
| [`duplicate.rs`](../krokiet/src/connect_scan/duplicate.rs) | DuplicateFinder | check_method, hash_type, use_prehash, ... | Yes (reference or sorted groups) |
| [`similar_images.rs`](../krokiet/src/connect_scan/similar_images.rs) | SimilarImages | hash_alg, resize_algorithm, hash_size, similarity, ... | Yes |
| [`similar_videos.rs`](../krokiet/src/connect_scan/similar_videos.rs) | SimilarVideos | similarity, skip_forward, vid_hash_duration, crop_detect, ... | Yes |
| [`same_music.rs`](../krokiet/src/connect_scan/same_music.rs) | SameMusic | music_similarity flags, approximate_comparison, ... | Yes |
| [`big_files.rs`](../krokiet/src/connect_scan/big_files.rs) | BigFile | number_of_files, search_mode | No |
| [`empty_files.rs`](../krokiet/src/connect_scan/empty_files.rs) | EmptyFiles | (none) | No |
| [`empty_folders.rs`](../krokiet/src/connect_scan/empty_folders.rs) | EmptyFolder | (none) | No |
| [`temporary_files.rs`](../krokiet/src/connect_scan/temporary_files.rs) | Temporary | custom extensions | No |
| [`broken_files.rs`](../krokiet/src/connect_scan/broken_files.rs) | BrokenFiles | checked_types (audio/pdf/image/archive/video) | No |
| [`bad_extensions.rs`](../krokiet/src/connect_scan/bad_extensions.rs) | BadExtensions | (none) | No |
| [`bad_names.rs`](../krokiet/src/connect_scan/bad_names.rs) | BadNames | NameIssues (uppercase, emoji, spaces, non-ascii, ...) | No |
| [`invalid_symlinks.rs`](../krokiet/src/connect_scan/invalid_symlinks.rs) | InvalidSymlinks | (none) | No |
| [`exif_remover.rs`](../krokiet/src/connect_scan/exif_remover.rs) | ExifRemover | ignored_tags | No |
| [`video_optimizer.rs`](../krokiet/src/connect_scan/video_optimizer.rs) | VideoOptimizer | mode (crop/transcode), codec, quality, ... | No |

---

## 12. Selection Logic — [`src/connect_select/`](../krokiet/src/connect_select)

### [`mod.rs`](../krokiet/src/connect_select/mod.rs)

**Purpose:** Check/Uncheck selection tools.

- `connect_select()` — registers `on_select_items` and `on_update_select_buttons` callbacks
- `set_select_buttons()` — builds the select popup list based on active tab type
- Selection modes: SelectAll, UnselectAll, InvertSelection, InvertSelectionInGroup
- Property-based: SelectTheBiggestSize, SelectTheSmallestSize, SelectNewest, SelectOldest, SelectShortestPath, SelectLongestPath (and "except" variants)
- Custom: SelectCustom (delegates to `custom_select.rs`)
- Respects group boundaries and reference folder rules

### [`custom_select.rs`](../krokiet/src/connect_select/custom_select.rs)

**Purpose:** Advanced regex/numeric/date filter selection.

- Builds column definitions per tool (`build_custom_select_columns()`)
- Supports `ColumnType`: Str, Int (with operators `>=`, `<=`, `>`, `<`, `=`), Date, FullPath
- `select_custom_columns()` — matches items against all enabled filters, selects/unselects
- Supports `leave_one_in_group` option (prevents selecting all items in a group)
- Extensive test suite

---

## 13. Model Operations — [`src/model_operations/`](../krokiet/src/model_operations)

### [`mod.rs`](../krokiet/src/model_operations/mod.rs)

**Purpose:** Shared model utilities.

- `remove_single_items_in_groups()` — removes orphaned groups (groups reduced to header only or header+1)
- `get_checked_info_from_app()` — computes checked item counts (flat or grouped)
- `get_checked_group_info_from_model()` — calculates `CheckedGroupItemsInfo`

### [`model_processor.rs`](../krokiet/src/model_operations/model_processor.rs)

**Purpose:** Background processing engine for file operations.

- `ModelProcessor` — converts Slint models to `SimplerSingleMainListModel`, processes in background thread, converts back
- `ProcessFunction::Simple` — single-item operations (delete, rename, move, etc.)
- `ProcessFunction::Related` — operations that pair items (hardlink, symlink)
- `process_items()` — runs parallel processing with progress reporting via `DelayedSender`
- `process_and_update_gui_state()` — orchestrates the full pipeline: show processing UI → process → remove processed items → update model → show result message

---

## 14. File Action Handlers — [`src/file_actions/`](../krokiet/src/file_actions)

Each file in `src/file_actions/` follows the same pattern using `ModelProcessor`:

| File | Operation | ProcessFunction |
|---|---|---|
| [`connect_delete.rs`](../krokiet/src/file_actions/connect_delete.rs) | Permanently delete files | Simple |
| [`connect_delete.rs`](../krokiet/src/file_actions/connect_delete.rs) (trash) | Move to trash | Simple |
| [`connect_rename.rs`](../krokiet/src/file_actions/connect_rename.rs) | Rename files | Simple |
| [`connect_move.rs`](../krokiet/src/file_actions/connect_move.rs) | Move files | Simple |
| [`connect_clean_exif.rs`](../krokiet/src/file_actions/connect_clean_exif.rs) | Strip EXIF data | Simple |
| [`connect_optimize_video.rs`](../krokiet/src/file_actions/connect_optimize_video.rs) | Optimize/compress videos | Simple |
| [`connect_hardlink.rs`](../krokiet/src/file_actions/connect_hardlink.rs) | Create hard links | Related |
| [`connect_symlink.rs`](../krokiet/src/file_actions/connect_symlink.rs) | Create symbolic links | Related |

---

## 15. Settings — [`src/settings/`](../krokiet/src/settings)

### [`mod.rs`](../krokiet/src/settings/mod.rs)

**Purpose:** Settings persistence and UI binding.

- `SettingsCustom` — per-preset settings (~80 fields)
- `BasicSettings` — global settings (language, theme, window size, select visibility flags)
- 10 normal presets + 1 reserved preset (`CLI Folders`)
- Settings stored as JSON in `~/.cache/Czkawka/Krokiet/config_preset_{N}.json` and `config_general.json`
- `connect_changing_settings_preset()` — handles preset load/save/reset

### [`model.rs`](../krokiet/src/settings/model.rs)

**Purpose:** Settings data structures with serde defaults.

- `SettingsCustom` — all per-tool settings with `#[serde(default = "...")]` defaults
- `BasicSettings` — global settings
- `ComboBoxItems` — holds the selected combo-box values with their typed values

### [`combo_box.rs`](../krokiet/src/settings/combo_box.rs) (inferred)

**Purpose:** Combo box item definitions (hash sizes, algorithms, check methods, codecs, etc.).

---

## 16. Utility Files

### [`audio_player.rs`](../krokiet/src/audio_player.rs)

**Purpose:** Play scan-completion sound.

- Optional (`audio` feature gate via `rodio`)
- Default sound: [`audio/stop_bit.mp3`](../krokiet/audio/stop_bit.mp3) (embedded at compile time)
- Custom sound via `KROKIET_AUDIO_STOP_FILE` environment variable
- Plays in a background thread

### [`clear_outdated_video_thumbnails.rs`](../krokiet/src/clear_outdated_video_thumbnails.rs)

**Purpose:** Background cleanup of video thumbnail cache.

- Removes thumbnails older than 7 days
- Runs at startup if `video_thumbnails_unused_thumbnails` is enabled

### [`set_initial_gui_info.rs`](../krokiet/src/set_initial_gui_info.rs)

**Purpose:** Assert combo-box model sync with Slint.

- Asserts that dynamically built combo-box lists match the statically declared Slint models
- Workaround for https://github.com/slint-ui/slint/issues/7632

### [`set_initial_scroll_list_data_indexes.rs`](../krokiet/src/set_initial_scroll_list_data_indexes.rs)

**Purpose:** Set column index metadata per tool.

- Array format: `[ParentPathIdx, FileNameIdx, PreviewPathIdx, RectLeftIdx, WidthIdx, HeightIdx]`
- Video tools (SimilarVideos, VideoOptimizer) set a PreviewPathIdx for thumbnail generation

### [`create_calculate_task_size.rs`](../krokiet/src/create_calculate_task_size.rs)

**Purpose:** Cache/size statistics for settings page.

- Background task that counts files and sizes in cache, thumbnails, and log directories
- Results shown in the Settings -> Cache section

### [`notification_manager.rs`](../krokiet/src/notification_manager.rs)

**Purpose:** Desktop notifications on scan completion.

- Linux: tries `notify-send` first, falls back to `notify-rust`
- Cross-platform: `notify-rust` for macOS and Windows

### [`test_common.rs`](../krokiet/src/test_common.rs)

**Purpose:** Test utilities.

- `get_main_list_model()` — creates a default `SingleMainListModel`
- `get_model_vec(n)` — creates a vector of n default models

### [`active_tab_meta.rs`](../krokiet/src/active_tab_meta.rs)

**Purpose:** Per-tab metadata lookup table (documented in section 9).

---

## 17. UI Structure — [`ui/*.slint`](../krokiet/ui)

### Layout Hierarchy

```
MainWindow (main_window.slint)
├── LeftSidePanel      — tool selection sidebar
├── VerticalLayout
│   ├── MainList       — results list (switches columns per active tab)
│   ├── Preview        — image/video preview panel (splitter-draggable)
│   ├── ToolSettings   — tool-specific settings (subsettings)
│   ├── Progress       — scan progress bar (visible when scanning/processing)
│   └── ActionButtons  — scan/stop/select/sort/delete/move/save/etc.
├── BottomPanel        — included/excluded directory paths
└── Popup overlays (18 popups)
```

### Key Slint Files

| File | Content |
|---|---|
| [`main_window.slint`](../krokiet/ui/main_window.slint) | Main layout, popup containers, scan/processing state |
| [`gui_state.slint`](../krokiet/ui/gui_state.slint) | `GuiState` global — all runtime UI state |
| [`callabler.slint`](../krokiet/ui/callabler.slint) | `Callabler` global — all callback declarations |
| [`common.slint`](../krokiet/ui/common.slint) | Shared types: `ActiveTab`, `SingleMainListModel`, `SelectMode`, etc. |
| [`translations.slint`](../krokiet/ui/translations.slint) | `Translations` global — all translated strings |
| [`settings.slint`](../krokiet/ui/settings.slint) | `Settings` global — all persisted settings |
| [`color_palette.slint`](../krokiet/ui/color_palette.slint) | Color definitions |
| [`fonts.slint`](../krokiet/ui/fonts.slint) | Font size definitions |
| [`text_size.slint`](../krokiet/ui/text_size.slint) | Text size measurement helpers |
| [`left_side_panel.slint`](../krokiet/ui/left_side_panel.slint) | Tool sidebar with icons |
| [`main_lists.slint`](../krokiet/ui/main_lists.slint) | Results table with selectable columns |
| [`action_buttons.slint`](../krokiet/ui/action_buttons.slint) | Scan/stop/action buttons |
| [`bottom_panel.slint`](../krokiet/ui/bottom_panel.slint) | Directory path list |
| [`preview.slint`](../krokiet/ui/preview.slint) | Image/video preview panel with metadata |
| [`progress.slint`](../krokiet/ui/progress.slint) | Progress bar |
| [`image_compare.slint`](../krokiet/ui/image_compare.slint) | Side-by-side image comparison overlay |
| [`selectable_tree_view.slint`](../krokiet/ui/selectable_tree_view.slint) | Path tree view with checkboxes |
| [`settings_list.slint`](../krokiet/ui/settings_list.slint) | Settings list items |
| [`tool_settings.slint`](../krokiet/ui/tool_settings.slint) | Tool-specific settings panel |
| [`included_paths.slint`](../krokiet/ui/included_paths.slint) | Included path configuration |
| [`about.slint`](../krokiet/ui/about.slint) | About tab content |

### Popup Files

| File | Purpose |
|---|---|
| [`popup_base.slint`](../krokiet/ui/popup_base.slint) | Base popup component |
| [`popup_action_confirm.slint`](../krokiet/ui/popup_action_confirm.slint) | Generic action confirmation |
| [`popup_centered_text.slint`](../krokiet/ui/popup_centered_text.slint) | Centered text display |
| [`popup_delete.slint`](../krokiet/ui/popup_delete.slint) | Delete confirmation |
| [`popup_trash.slint`](../krokiet/ui/popup_trash.slint) | Trash confirmation |
| [`popup_move_folders.slint`](../krokiet/ui/popup_move_folders.slint) | Move with options |
| [`popup_rename_bad_extensions.slint`](../krokiet/ui/popup_rename_bad_extensions.slint) | Rename bad extensions |
| [`popup_rename_bad_file_names.slint`](../krokiet/ui/popup_rename_bad_file_names.slint) | Rename bad file names |
| [`popup_save.slint`](../krokiet/ui/popup_save.slint) | Save format options |
| [`popup_sort.slint`](../krokiet/ui/popup_sort.slint) | Sort mode selection |
| [`popup_select_results.slint`](../krokiet/ui/popup_select_results.slint) | Selection mode selection |
| [`popup_custom_select.slint`](../krokiet/ui/popup_custom_select.slint) | Custom regex/numeric/date filter |
| [`popup_clean_cache.slint`](../krokiet/ui/popup_clean_cache.slint) | Cache cleaning with progress |
| [`popup_clean_exif.slint`](../krokiet/ui/popup_clean_exif.slint) | EXIF cleaning options |
| [`popup_optimize.slint`](../krokiet/ui/popup_optimize.slint) | Video re-encode options |
| [`popup_crop_video.slint`](../krokiet/ui/popup_crop_video.slint) | Video crop options |
| [`popup_new_directories.slint`](../krokiet/ui/popup_new_directories.slint) | Manual path entry |
| [`popup_context_menu.slint`](../krokiet/ui/popup_context_menu.slint) | Right-click context menu |

---

## 18. Icons — [`krokiet/icons/`](../krokiet/icons)

33 SVG icons plus PNG/ICO logo variants:

| Icon | Purpose |
|---|---|
| `krokiet_search.svg` | Scan |
| `krokiet_stop.svg` | Stop |
| `krokiet_select.svg` | Select |
| `krokiet_sort.svg` | Sort |
| `krokiet_delete.svg` | Delete |
| `krokiet_trash.svg` | Trash |
| `krokiet_move.svg` | Move |
| `krokiet_rename.svg` | Rename |
| `krokiet_save.svg` | Save |
| `krokiet_hardlink.svg` | Hardlink |
| `krokiet_symlink.svg` | Symlink |
| `krokiet_info.svg` | Info |
| `krokiet_dir.svg` | Directory |
| `krokiet_folder_add.svg` | Add directory |
| `krokiet_file_add.svg` | Add file |
| `krokiet_remove.svg` | Remove |
| `krokiet_clean.svg` | Clean cache |
| `krokiet_optimize.svg` | Video optimizer |
| `krokiet_settings.svg` | Settings |
| `krokiet_subsettings.svg` | Sub-settings |
| `krokiet_compare*.svg` (8) | Image comparison tools |
| `krokiet_manual_add.svg` | Manual path entry |

---

## 19. Audio — [`krokiet/audio/`](../krokiet/audio)

- [`stop_bit.mp3`](../krokiet/audio/stop_bit.mp3) — embedded scan-completion sound

---

## 20. Translations — [`krokiet/i18n/`](../krokiet/i18n)

27 language directories, each containing a `krokiet.ftl` file:

`ar`, `bg`, `cs`, `de`, `el`, `en` (source), `es-ES`, `fa`, `fr`, `hi`, `id`, `it`, `ja`, `ko`, `nl`, `no`, `pl`, `pt-BR`, `pt-PT`, `ro`, `ru`, `sv-SE`, `tr`, `uk`, `vi`, `zh-CN`, `zh-TW`

---

## 21. Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                     Slint UI (.slint)                     │
│  MainWindow, GuiState, Callabler, Translations, Settings │
└────────────────────┬────────────────────────────────────┘
                     │ callbacks ↑↓ property bindings
┌────────────────────▼────────────────────────────────────┐
│                   main.rs (event loop)                    │
│  Init → wire callbacks → app.run() → save on exit        │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│            connect_*.rs (callback handlers)               │
│  scan │ compare │ filter │ sort │ save │ stop │ ...      │
└─────┬──────┬──────┬──────┬──────┬──────┬────────────────┘
      │      │      │      │      │      │
┌─────▼──┐ ┌─▼────┐ │ ┌────▼───┐ │ ┌────▼───┐
│connect │ │file  │ │ │connect │ │ │settings│
│_scan/  │ │_actions/ │ │_select/│ │ │/       │
│14 tools│ │7 ops │ │ │19 modes│ │ │model.rs│
└───┬────┘ └──────┘ │ └────────┘ │ └────────┘
    │                │            │
┌───▼────────────────▼────────────▼──────────┐
│            czkawka_core (scanning engine)    │
│  DuplicateFinder, SimilarImages, ...         │
└─────────────────────────────────────────────┘
```

### Data Flow for a Scan

1. User clicks **Scan** in `action_buttons.slint`
2. `on_scan_starting(ActiveTab)` callback fires → [`connect_scan_button()`](../krokiet/src/connect_scan.rs:67)
3. Settings collected, `ScanData` struct created
4. Tool-specific function spawns a thread (e.g. [`scan_duplicates()`](../krokiet/src/connect_scan/duplicate.rs:19))
5. Thread runs `tool.search()`, sends progress via crossbeam channel
6. [`connect_progress_gathering()`](../krokiet/src/connect_progress_receiver.rs:11) receives progress and updates Slint progress bars
7. On completion, results are converted to `SingleMainListModel` rows and set on the app
8. Model change propagates to Slint, which re-renders the results list
9. `app.invoke_scan_ended()` displays result summary

### Data Flow for File Operations

1. User checks items, clicks action button (e.g. Delete)
2. [`connect_show_confirmation()`](../krokiet/src/connect_show_confirmation.rs:12) sets up confirmation text, shows popup
3. User confirms → `invoke_show_action_popup()` → action handler called
4. Action handler uses [`ModelProcessor`](../krokiet/src/model_operations/model_processor.rs) to run the operation in background
5. `ModelProcessor` converts model → processes with rayon → converts back → updates GUI


---

## Verification Notes

*Verified against source code on 2026-06-29.*

**Checked and confirmed accurate:**
- Cargo.toml: version 11.0.1, slint 1.17.0, all dependency versions, feature flags (audio, 9 renderers, 3 image formats, xdg_portal_trash), default features (winit_femtovg, winit_software)
- build.rs: SLINT_STYLE default "fluent-dark" logic correctly described
- main.rs 22-step initialization flow: all steps verified, line order matches source
- shared_models.rs: `SharedModels` struct with 14 tool `Option<>` fields, `new_shared()` returning `Arc<RwLock<Self>>`, `save_results()` and `get_use_reference_folders()` methods
- common.rs: all 14 tool column enums (str + int pairs) and line numbers verified accurate (one exception noted below)
- localizer_krokiet.rs: `flk!` macro, `LANGUAGE_LOADER_KROKIET`, `LazyLock<FluentLanguageLoader>`, `rust-embed` all correct
- simpler_model.rs: `SimplerSingleMainListModel` struct, `ToSimplerVec`/`ToSlintModel` traits correctly described
- active_tab_meta.rs: `TabMeta` tuple (str_path_idx, str_name_idx, int_date_idx, int_size_opt, is_header_mode), all line references verified accurate
- connect_scan.rs: `ScanData` struct, `connect_scan_button()` at line 67 verified
- connect_scan/ directory: 14 tool files, all tool names and group statuses correct
- connect_compare.rs: image comparison flow correctly described
- connect_show_confirmation.rs: `connect_show_confirmation()` at line 12 verified
- connect_progress_receiver.rs: `connect_progress_gathering()` at line 11 verified
- All .slint files (39 total = 21 main + 18 popup) verified present
- i18n directories: 27 language codes listed correctly in document
- connect_scan/mod.rs: 14 sub-module declarations match 14 files

**Corrections made (see above):**
- `StrDataSimilarMusic` enum line number: 196 → 195
- Connect function count: ~20 → ~27
- Popup count in layout hierarchy: 17 → 18
- SVG icon count: 34 → 33
- Compare SVG icons: 6 → 8
- Language directory count: 28 → 27
- LANGUAGE_LIST count: 28 → 27
