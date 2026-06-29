# czkawka_core — The Shared Scanning Engine

**Location:** [`czkawka_core/`](czkawka_core/)  
**Version:** 11.0.1  
**License:** MIT  
**Edition:** 2024 (min Rust 1.92.0)

---

## Table of Contents

1. [Overview](#overview)
2. [Cargo.toml — Dependencies & Features](#cargotoml--dependencies--features)
3. [Public API (`src/lib.rs`)](#public-api-srclibrs)
4. [Localization (`src/localizer_core.rs`)](#localization-srclocalizer_corers)
5. [Build Script (`build.rs`)](#build-script-buildrs)
6. [Common Infrastructure (`src/common/`)](#common-infrastructure-srccommon)
   - [Module Structure (`mod.rs`)](#module-structure-modrs)
   - [Constants (`consts.rs`)](<#constants-constsrs>)
   - [Model Types (`model.rs`)](<#model-types-modelrs>)
   - [Tool Data & Traits (`tool_data.rs`, `traits.rs`)](<#tool-data--traits-tool_datars-traitsrs>)
   - [Directory Traversal (`dir_traversal.rs`)](<#directory-traversal-dir_traversalrs>)
   - [Directories (`directories.rs`)](<#directories-directoriesrs>)
   - [Extensions (`extensions.rs`)](<#extensions-extensionsrs>)
   - [Excluded Items (`items.rs`)](<#excluded-items-itemsrs>)
   - [Cache System (`cache.rs`, `config_cache_path.rs`, `cache/cleaning.rs`)](<#cache-system-cachers-config_cache_pathrs-cachecleaningrs>)
   - [Image Processing (`image.rs`)](<#image-processing-imagers>)
   - [Video Utilities (`video_utils.rs`, `ffmpeg_utils.rs`)](<#video-utilities-video_utilsrs-ffmpeg_utilsrs>)
   - [Progress Reporting (`progress_data.rs`, `progress_stop_handler.rs`)](<#progress-reporting-progress_datars-progress_stop_handlers>)
   - [Logger (`logger.rs`)](<#logger-loggerrs>)
   - [Process Utilities (`process_utils.rs`)](<#process-utilities-process_utilsrs>)
   - [CLI Argument Parsing (`basic_gui_cli.rs`)](<#cli-argument-parsing-basic_gui_clirs>)
   - [Helper Functions (`mod.rs` top-level)](#helper-functions-modrs-top-level)
7. [Helper Modules (`src/helpers/`)](#helper-modules-srchelpers)
8. [Tools (`src/tools/`)](#tools-srctools)
   - [Duplicate Finder (`duplicate/`)](<#duplicate-finder-duplicate>)
   - [Similar Images (`similar_images/`)](<#similar-images-similar_images>)
   - [Similar Videos (`similar_videos/`)](<#similar-videos-similar_videos>)
   - [Same Music (`same_music/`)](<#same-music-same_music>)
   - [Big File (`big_file/`)](<#big-file-big_file>)
   - [Empty Files (`empty_files/`)](<#empty-files-empty_files>)
   - [Empty Folder (`empty_folder/`)](<#empty-folder-empty_folder>)
   - [Temporary Files (`temporary/`)](<#temporary-files-temporary>)
   - [Broken Files (`broken_files/`)](<#broken-files-broken_files>)
   - [Bad Extensions (`bad_extensions/`)](<#bad-extensions-bad_extensions>)
   - [Bad Names (`bad_names/`)](<#bad-names-bad_names>)
   - [Invalid Symlinks (`invalid_symlinks/`)](<#invalid-symlinks-invalid_symlinks>)
   - [EXIF Remover (`exif_remover/`)](<#exif-remover-exif_remover>)
   - [Video Optimizer (`video_optimizer/`)](<#video-optimizer-video_optimizer>)
9. [Benchmarks (`benches/`)](#benchmarks-benches)
10. [Test Resources (`test_resources/`)](#test-resources-test_resources)
11. [Internationalization (`i18n/`)](#internationalization-i18n)

---

## Overview

`czkawka_core` is the **shared scanning engine** used by all frontends (`czkawka_cli`, `czkawka_gui`, `krokiet`, `cedinia`). It has no UI dependency — it provides pure scanning, analysis, and file-operations logic. Every tool in the app (duplicate finder, similar images, etc.) is implemented here as a sub-module under [`src/tools/`](czkawka_core/src/tools/).

---

## Cargo.toml — Dependencies & Features

**File:** [`czkawka_core/Cargo.toml`](czkawka_core/Cargo.toml)

### Key Dependencies

| Dependency | Version | Purpose |
|---|---|---|
| [`rayon`](https://crates.io/crates/rayon) | 1.10 | Parallel iterators — all CPU-bound work is parallelized |
| [`crossbeam-channel`](https://crates.io/crates/crossbeam-channel) | 0.5 | Progress reporting channel between worker threads and UI |
| [`blake3`](https://crates.io/crates/blake3) | 1.5 | Default hash algorithm for duplicate file detection |
| [`blake3/pure`](https://crates.io/crates/blake3) | _feature_ | Pure Rust implementation (no SIMD) via `blake_pure` feature |
| [`crc32fast`](https://crates.io/crates/crc32fast) | 1.4 | Alternative hash (CRC32) |
| [`xxhash-rust`](https://crates.io/crates/xxhash-rust) | 0.8 (xxh3) | Alternative hash (XXH3) |
| [`image-rs`](https://crates.io/crates/image) | 0.25 | Image decoding (many formats via feature flags) |
| [`image_hasher`](https://crates.io/crates/image_hasher) | 3.0 | Perceptual image hashing (Mean, Gradient, Blockhash, etc.) |
| [`bk-tree`](https://crates.io/crates/bk-tree) | 0.5 | BK-tree data structure for fast similarity search among image hashes |
| [`fast_image_resize`](https://crates.io/crates/fast_image_resize) | 6.0 | Fast image resizing for hash generation |
| [`hamming-bitwise-fast`](https://crates.io/crates/hamming-bitwise-fast) | 1.0 | Bitwise Hamming distance computation |
| [`vid_dup_finder_lib`](https://crates.io/crates/vid_dup_finder_lib) | 0.4 | Video fingerprinting / comparison |
| [`lofty`](https://crates.io/crates/lofty) | 0.24 | Audio tag reading (ID3, etc.) |
| [`rusty-chromaprint`](https://crates.io/crates/rusty-chromaprint) | 0.3 | Audio fingerprinting (Chromaprint) |
| [`symphonia`](https://crates.io/crates/symphonia) | 0.5 | Audio decoding for fingerprinting |
| [`zip`](https://crates.io/crates/zip) | 8.1 | ZIP archive validation for broken files |
| [`lopdf`](https://crates.io/crates/lopdf) | 0.40 | PDF validation for broken files |
| [`rawler`](https://crates.io/crates/rawler) | 0.7 | RAW image decoding (default, pure Rust) |
| [`libraw-rs`](https://crates.io/crates/libraw-rs) | 0.0.4 (optional) | Alternative RAW decoding (via `libraw` feature) |
| [`libheif-rs`](https://crates.io/crates/libheif-rs) | 2 (optional) | HEIC/HEIF image decoding (via `heif` feature) |
| [`jxl-oxide`](https://crates.io/crates/jxl-oxide) | 0.12 | JPEG XL decoding |
| [`serde`](https://crates.io/crates/serde) + [`bincode`](https://crates.io/crates/bincode) | 1.0 / <2.0 | Cache serialization (binary) |
| [`serde_json`](https://crates.io/crates/serde_json) | 1.0 | Cache serialization (JSON) for easy inspection |
| [`i18n-embed`](https://crates.io/crates/i18n-embed) | 0.16 | Fluent-based internationalization |
| [`indexmap`](https://crates.io/crates/indexmap) | 2.11 | Stable-iteration ordered map/set |
| [`directories-next`](https://crates.io/crates/directories-next) | 2.0 | Platform-specific config/cache directories |
| [`infer`](https://crates.io/crates/infer) | 0.19 | MIME type detection from file content |
| [`mime_guess`](https://crates.io/crates/mime_guess) | 2.0 | Extension ↔ MIME lookup |
| [`nom-exif`](https://crates.io/crates/nom-exif) | 2.1 | EXIF orientation reading |
| [`little_exif`](https://crates.io/crates/little_exif) | 0.6 | EXIF data removal/writing |
| [`fun_time`](https://crates.io/crates/fun_time) | 0.3 | Timing instrumentation (debug logging) |
| [`trash`](https://crates.io/crates/trash) | 5.1 | Move files to system trash (desktop platforms) |

### Optional Features

| Feature | Effect |
|---|---|
| `heif` | Enables `libheif-rs` for HEIC/HEIF decoding |
| `libraw` | Enables `libraw-rs` (native libraw) instead of `rawler` |
| `libavif` | Enables AVIF image format support in `image-rs` |
| `blake_pure` | Uses pure-Rust blake3 (no SIMD intrinsics) |
| `xdg_portal_trash` | Uses `ashpd` + `tokio` for trash via xdg-desktop-portal (Flatpak) |

### Platform-conditional Dependencies

- **Non-Android/iOS:** [`trash`](https://crates.io/crates/trash) 5.1 for moving files to system recycle bin
- **Windows:** [`file-id`](https://crates.io/crates/file-id) 0.2 for high-resolution file ID (hardlink detection)

---

## Public API (`src/lib.rs`)

**File:** [`czkawka_core/src/lib.rs`](czkawka_core/src/lib.rs)

```rust
pub mod common;
pub mod helpers;
pub mod localizer_core;
pub mod tools;

pub mod re_exported {
    pub use fast_image_resize::FilterType as FirFilterType;
    pub use image_hasher::{FilterType, HashAlg};
    pub use vid_dup_finder_lib::Cropdetect;
}

pub const CZKAWKA_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const TOOLS_NUMBER: usize = 14;
```

Four public modules are exposed:
- [`common`](czkawka_core/src/common/) — Infrastructure (traits, types, traversal, caching, progress)
- [`helpers`](czkawka_core/src/helpers/) — Generic utilities (timer, delayed sender, ffprobe, messages)
- [`localizer_core`](czkawka_core/src/localizer_core.rs) — Fluent translation macros
- [`tools`](czkawka_core/src/tools/) — All 14 scanning tools

The `re_exported` module makes three external types available to frontends without requiring direct dependencies on `image_hasher`, `fast_image_resize`, or `vid_dup_finder_lib`.

`TOOLS_NUMBER` is a const `14` representing the total count of scanning tools.

---

## Localization (`src/localizer_core.rs`)

**File:** [`czkawka_core/src/localizer_core.rs`](czkawka_core/src/localizer_core.rs)

Uses the `i18n-embed` framework with Fluent (`.ftl`) files. The macro [`flc!("key")`](czkawka_core/src/localizer_core.rs:19) / `flc!("key", var = value)` is defined and exported for use throughout the crate and by frontends.

Key exports:
- [`LANGUAGE_LOADER_CORE`](czkawka_core/src/localizer_core.rs:11): `LazyLock<FluentLanguageLoader>` — loads fallback language from embedded `i18n/` folder
- [`flc!`](czkawka_core/src/localizer_core.rs:19): Macro that calls `i18n_embed_fl::fl!()` with the core language loader
- [`localizer_core()`](czkawka_core/src/localizer_core.rs:26): Returns a `Box<dyn Localizer>` for the core
- [`generate_translation_hashmap()`](czkawka_core/src/localizer_core.rs:30): Converts a vec of key-value pairs into a `HashMap`
- [`fnc_get_similarity_very_high()`](czkawka_core/src/localizer_core.rs:38) / [`fnc_get_similarity_minimal()`](czkawka_core/src/localizer_core.rs:42): Helper functions returning translated similarity labels

---

## Build Script (`build.rs`)

**File:** [`czkawka_core/build.rs`](czkawka_core/build.rs)

At compile time, this script injects several environment variables:
- `RUST_VERSION_INTERNAL` — Rust compiler version and date
- `UUSED_RUSTFLAGS` — Encoded `RUSTFLAGS` (for debugging)
- `CZKAWKA_GIT_COMMIT` / `CZKAWKA_GIT_COMMIT_SHORT` — Git commit hash (10 chars)
- `CZKAWKA_GIT_COMMIT_DATE` — Commit date
- `CZKAWKA_OFFICIAL_BUILD` — Set to `1` if `CZKAWKA_OFFICIAL_BUILD=1` env is set
- `USING_CRANELIFT` — Set if codegen backend is Cranelift
- `CZKAWKA_LIBC_VERSIONS` / `CZKAWKA_LIBC` — Linux libc info (glibc/musl + versions)

---

## Common Infrastructure (`src/common/`)

### Module Structure (`mod.rs`)

**File:** [`czkawka_core/src/common/mod.rs`](czkawka_core/src/common/mod.rs)

Contains 18 sub-modules and top-level helper functions:

```rust
pub mod basic_gui_cli;
pub mod cache;
pub mod config_cache_path;
pub mod consts;
pub mod dir_traversal;
pub mod directories;
pub mod extensions;
pub mod ffmpeg_utils;
pub mod image;
pub mod items;
pub mod logger;
pub mod model;
pub mod process_utils;
pub mod progress_data;
pub mod progress_stop_handler;
pub mod tool_data;
pub mod traits;
pub mod video_utils;
```

#### Top-level Helper Functions

- [`get_number_of_threads()`](czkawka_core/src/common/mod.rs:68) / [`set_number_of_threads()`](czkawka_core/src/common/mod.rs:85) — Thread pool management. Setting threads rebuilds the global rayon thread pool with the specified count and a 4 MB stack size per worker.
- [`get_all_available_threads()`](czkawka_core/src/common/mod.rs:73) — Returns available parallelism (cached).
- [`check_if_folder_contains_only_empty_folders()`](czkawka_core/src/common/mod.rs:105) — Recursively checks if a folder tree contains only empty folders.
- [`remove_folder_if_contains_only_empty_folders()`](czkawka_core/src/common/mod.rs:190) — Deletes or trashes a directory tree after verifying it's all empty folders.
- [`remove_single_file()`](czkawka_core/src/common/mod.rs:207) / [`remove_single_folder()`](czkawka_core/src/common/mod.rs:225) — Delete or trash a single file/folder.
- [`split_path()`](czkawka_core/src/common/mod.rs:238) — Splits a path into `(parent, file_name)`.
- [`split_path_compare()`](czkawka_core/src/common/mod.rs:246) — Compares two paths by parent first, then file name.
- [`format_time()`](czkawka_core/src/common/mod.rs:253) — Formats a `Duration` into human-readable string (`"1h 2m 3s"` / `"1.23s"` / `"999ms"`).
- [`regex_check()`](czkawka_core/src/common/mod.rs:283) — Wildcard-style pattern matching used for excluded items.
- [`normalize_windows_path()`](czkawka_core/src/common/mod.rs:327) — Normalizes path casing and separators for Windows.
- [`make_hard_link()`](czkawka_core/src/common/mod.rs:353) — Creates a hard link, atomically replacing the destination via a temporary file.
- [`make_file_symlink()`](czkawka_core/src/common/mod.rs:383) — Creates a symbolic link (Unix/Windows), with atomic replacement.
- [`debug_save_file()`](czkawka_core/src/common/mod.rs:426) — Appends a string to a file (debug helper).

### Constants (`consts.rs`)

**File:** [`czkawka_core/src/common/consts.rs`](czkawka_core/src/common/consts.rs)

- `DEFAULT_THREAD_SIZE`: 8 MB — default stack size per thread
- `DEFAULT_WORKER_THREAD_SIZE`: 4 MB — worker thread stack size
- `VIDEO_RESOLUTION_LIMIT`: 16384 — max video dimension (prevents overflow in GUI)
- Extension lists:
  - `RAW_IMAGE_EXTENSIONS` — 22 raw formats (CR2, NEF, ARW, etc.)
  - `IMAGE_RS_EXTENSIONS` — Standard image formats (JPEG, PNG, WebP, etc.; includes AVIF with `libavif` feature, always includes JXL)
  - `IMAGE_RS_SIMILAR_IMAGES_EXTENSIONS` — Subset for similar-images tool (excludes GIF, ICO)
  - `IMAGE_RS_BROKEN_FILES_EXTENSIONS` — Extended list for broken-files check
  - `HEIC_EXTENSIONS` — HEIF/HEIC family extensions
  - `ZIP_FILES_EXTENSIONS` — `["zip", "jar"]`
  - `PDF_FILES_EXTENSIONS` — `["pdf"]`
  - `AUDIO_FILES_EXTENSIONS` — 19 audio formats
  - `VIDEO_FILES_EXTENSIONS` — 36 video formats covering popular, mobile, broadcast, professional, and raw codec files
  - `TEXT_FILES_EXTENSIONS` — 14 document extensions
  - `EXIF_FILES_EXTENSIONS` — Extensions supported by `little_exif` for EXIF operations

### Model Types (`model.rs`)

**File:** [`czkawka_core/src/common/model.rs`](czkawka_core/src/common/model.rs)

Core enums and types used across all tools:

- [`ToolType`](czkawka_core/src/common/model.rs:9) — Enum with 14 tool variants + `None`. Implements [`may_use_reference_paths()`](czkawka_core/src/common/model.rs:30) which returns `true` for Duplicate, SameMusic, SimilarImages, SimilarVideos.
- [`CheckingMethod`](czkawka_core/src/common/model.rs:36) — `None`, `Name`, `SizeName`, `Size`, `Hash`, `AudioTags`, `AudioContent`.
- [`FileEntry`](czkawka_core/src/common/model.rs:48) — Base `path: PathBuf`, `size: u64`, `modified_date: u64`, `inode: u64`. Implements `ResultEntry`. Supports `Serialize`/`Deserialize` for caching.
- [`HashType`](czkawka_core/src/common/model.rs:71) — `Blake3`, `Crc32`, `Xxh3`. Each produces a `Box<dyn MyHasher>` via `hasher()`.
- [`WorkContinueStatus`](czkawka_core/src/common/model.rs:89) — `Continue` / `Stop`.

### Tool Data & Traits (`tool_data.rs`, `traits.rs`)

**File:** [`czkawka_core/src/common/tool_data.rs`](czkawka_core/src/common/tool_data.rs)

- [`CommonToolData`](czkawka_core/src/common/tool_data.rs:22) — The base configuration struct for every tool:
  - `tool_type`, `text_messages`, `directories`, `extensions`, `excluded_items`
  - `recursive_search`, `delete_method`, `maximal_file_size`, `minimal_file_size`
  - `stopped_search`, `use_cache`, `delete_outdated_cache`, `save_also_as_json`
  - `use_reference_folders`, `dry_run`, `move_to_trash`, `hide_hard_links`
- [`DeleteResult`](czkawka_core/src/common/tool_data.rs:44) — Tracks deleted files, gained bytes, errors.
- [`DeleteItemType<T>`](czkawka_core/src/common/tool_data.rs:60) — Enum: `DeletingFiles(Vec<T>)`, `DeletingFolders(Vec<T>)`, `HardlinkingFiles(Vec<(T, Vec<T>)>)`.
- [`DeleteMethod`](czkawka_core/src/common/tool_data.rs:83) — `None`, `Delete`, `AllExceptNewest`, `AllExceptOldest`, `OneOldest`, `OneNewest`, `HardLink`, `AllExceptBiggest`, `AllExceptSmallest`, `OneBiggest`, `OneSmallest`.
- [`CommonData` trait](czkawka_core/src/common/tool_data.rs:122) — Required by all tools. Provides associated types `Info` and `Parameters`. Defines getters/setters for all `CommonToolData` fields + methods like `prepare_items()` (validates paths/extensions), `delete_elements()` (parallel file deletion/hardlinking with progress), `delete_simple_elements_and_add_to_messages()`, `delete_advanced_elements_and_add_to_messages()` (implements the various `DeleteMethod` strategies).

**File:** [`czkawka_core/src/common/traits.rs`](czkawka_core/src/common/traits.rs)

- [`DebugPrint`](czkawka_core/src/common/traits.rs:15) — One method: `debug_print()`.
- [`PrintResults`](czkawka_core/src/common/traits.rs:19) — Text/JSON output: `write_results()`, `print_results_to_output()`, `print_results_to_file()`, `save_results_to_file_as_json()`, `save_all_in_one()`.
- [`DeletingItems`](czkawka_core/src/common/traits.rs:118) — `delete_files()`.
- [`FixingItems`](czkawka_core/src/common/traits.rs:123) — `fix_items()` (used by repair tools like BadExtensions, BadNames).
- [`ResultEntry`](czkawka_core/src/common/traits.rs:129) — `get_path()`, `get_modified_date()`, `get_size()`, `get_inode()`.
- [`Search`](czkawka_core/src/common/traits.rs:143) — `search()` — the main entry point for all scanning tools.
- [`AllTraits`](czkawka_core/src/common/traits.rs:147) — Blanket trait combining all above.

### Directory Traversal (`dir_traversal.rs`)

**File:** [`czkawka_core/src/common/dir_traversal.rs`](czkawka_core/src/common/dir_traversal.rs)

This is a **highly optimized, parallel directory walker** using the builder pattern.

- [`DirTraversalBuilder`](czkawka_core/src/common/dir_traversal.rs:39) — Builder with chainable methods:
  - `common_data()` — Sets root dirs/files, extensions, excluded items from `CommonToolData`
  - `stop_flag()`, `progress_sender()`, `checking_method()`
  - `minimal_file_size()`, `maximal_file_size()`
  - `collect()` — `Collect::Files` (default) or `Collect::InvalidSymlinks`
  - `group_by()` — Takes a closure `Fn(&FileEntry) -> T` to group results by arbitrary criteria (e.g. file size, name, inode)
  - `build()` — Consumes builder and returns `DirTraversal`
- [`DirTraversal`](czkawka_core/src/common/dir_traversal.rs:57) — The runner. `run()` returns `DirTraversalResult<T>`:
  - `SuccessFiles { warnings, grouped_file_entries: BTreeMap<T, Vec<FileEntry>> }`
  - `Stopped`
- **Algorithm:**
  1. Processes root **files** sequentially (usually few)
  2. Processes **folders** in parallel batches using `rayon` with `with_max_len(2)` to avoid checking too many folders at once
  3. For each entry, checks extension validity, exclusion rules, file size range
  4. On Unix, supports cross-filesystem exclusion via device IDs
  5. Collects results and groups them by the user-supplied closure into a `BTreeMap`
- Key helpers: `common_read_dir()`, `common_get_entry_data()`, `common_get_metadata_dir()`, `common_get_metadata_from_path()`, `get_modified_time()`.

### Directories (`directories.rs`)

**File:** [`czkawka_core/src/common/directories.rs`](czkawka_core/src/common/directories.rs)

Manages included, excluded, and reference paths.

- [`Directories`](czkawka_core/src/common/directories.rs:10) struct holds:
  - `included_directories`, `excluded_directories`, `reference_directories`
  - `included_files`, `excluded_files`, `reference_files`
  - Original (pre-optimization) copies for debugging
  - Unix: `included_dev_ids` for cross-filesystem exclusion
- [`optimize_directories()`](czkawka_core/src/common/directories.rs:132) — Critical optimization pass:
  1. Deduplicates all path lists
  2. Removes nested included directories (e.g., `/` subsumes `/home`)
  3. Removes included items inside excluded directories
  4. Removes included files that are inside included directories (they'd be found anyway)
  5. Removes non-existent paths
  6. Keeps only excluded directories that are within included directories
  7. Keeps only reference paths that are within included paths
  8. On Unix, collects device IDs if `exclude_other_filesystems` is enabled
  9. Returns error if no paths remain or reference == included
- [`filter_reference_folders()`](czkawka_core/src/common/directories.rs:297) — Partitions grouped file entries into `(reference_file, [normal_files])` tuples.

### Extensions (`extensions.rs`)

**File:** [`czkawka_core/src/common/extensions.rs`](czkawka_core/src/common/extensions.rs)

- [`Extensions`](czkawka_core/src/common/extensions.rs:10) — Holds `allowed_extensions_hashset` and `excluded_extensions_hashset` (both `IndexSet<String>`).
- [`filter_extensions()`](czkawka_core/src/common/extensions.rs:20) — Static method that processes user-provided extensions:
  - Expands `"image"` → `IMAGE_RS_EXTENSIONS`, `"video"` → `VIDEO_FILES_EXTENSIONS`, etc.
  - Strips leading dots, lowercases, validates no spaces/dots in extension
- [`check_if_entry_have_valid_extension()`](czkawka_core/src/common/extensions.rs:68) — Highly optimized check: extracts extension manually via `rfind('.')` (5x faster than `Path::extension()`).
- [`set_and_validate_extensions()`](czkawka_core/src/common/extensions.rs:98) — Computes intersection of user-allowed extensions with tool-provided extensions; removes overlapping allowed/excluded entries.

### Excluded Items (`items.rs`)

**File:** [`czkawka_core/src/common/items.rs`](czkawka_core/src/common/items.rs)

- [`ExcludedItems`](czkawka_core/src/common/items.rs:21) — Holds a list of glob-like exclusion patterns.
- [`DEFAULT_EXCLUDED_ITEMS`](czkawka_core/src/common/items.rs:11) — Platform-specific defaults:
  - **Linux (non-macOS):** `*/.git/*,*/node_modules/*,*/lost+found/*,*/Trash/*,*/.Trash-*/*,*/snap/*,/home/*/.cache/*,/home/*/.var/app/,/home/*/.*`
  - **macOS:** Similar but without snap/cache/var patterns
  - **Windows:** `*\git\*,*\node_modules\*,*\lost+found\*,*:\windows\*`, etc.
- [`DEFAULT_EXCLUDED_DIRECTORIES`](czkawka_core/src/common/items.rs:7) — `/proc`, `/dev`, `/sys`, `/snap` (Unix) or `C:\Windows` (Windows).
- [`SingleExcludedItem`](czkawka_core/src/common/items.rs:27) — Parsed exclusion pattern with pre-split expressions for fast matching.
- [`regex_check()`](czkawka_core/src/common/mod.rs:283) — Implements the glob matching logic (split on `*`, check starts-with/ends-with, verify ordering).

### Cache System (`cache.rs`, `config_cache_path.rs`, `cache/cleaning.rs`)

**File:** [`czkawka_core/src/common/config_cache_path.rs`](czkawka_core/src/common/config_cache_path.rs)

- Uses `OnceCell<Option<ConfigCachePath>>` — must be initialized once via `set_config_cache_path()`.
- Path resolution order: `CZKAWKA_CONFIG_PATH` / `CZKAWKA_CACHE_PATH` env vars → `ProjectDirs` for `pl.Qarmin.<name>` → Android app-private dirs.
- On Android: cache at `$DATA_DIR/cache/<name>`, config at `$DATA_DIR/files/<name>`.
- [`open_cache_folder()`](czkawka_core/src/common/config_cache_path.rs:172) — Opens both `.bin` and `.json` cache variants.

**File:** [`czkawka_core/src/common/cache.rs`](czkawka_core/src/common/cache.rs)

- **Cache versions** — Each tool has a version constant:
  - `CACHE_VERSION`: 100 (generic)
  - `CACHE_DUPLICATE_VERSION`: 100
  - `CACHE_IMAGE_VERSION`: 100
  - `CACHE_VIDEO_VERSION`: 110
  - `CACHE_BROKEN_FILES_VERSION`: 120
  - `CACHE_VIDEO_OPTIMIZE_VERSION`: 110
- **Memory limit:** 8 GB (bincode serialization limit).
- Key functions:
  - [`save_cache_to_file_generalized()`](czkawka_core/src/common/cache.rs:48) — Serializes `BTreeMap<String, T>` to `.bin` (bincode) and optionally `.json` (serde_json).
  - [`load_cache_from_file_generalized_by_path()`](czkawka_core/src/common/cache.rs:111) — Loads cache, validates entries against current files (size, modified_date, inode), filters outdated.
  - [`load_cache_from_file_generalized_by_size()`](czkawka_core/src/common/cache.rs:150) — Same but works with `BTreeMap<u64, Vec<T>>` (used by duplicate finder).
  - [`load_and_split_cache_generalized_by_path()`](czkawka_core/src/common/cache.rs:297) — Complete load-split workflow: load cache → extract already-cached records → return remaining for processing. Used by most tools.
  - [`save_and_connect_cache_generalized_by_path()`](czkawka_core/src/common/cache.rs:335) — Merge newly computed results with cached data and save.

**File:** [`czkawka_core/src/common/cache/cleaning.rs`](czkawka_core/src/common/cache/cleaning.rs)

- [`clean_all_cache_files()`](czkawka_core/src/common/cache/cleaning.rs:180) — Iterates all known cache files, identifies their type by filename pattern, and removes entries whose files no longer exist or have changed size/modification time.
- Cache file identification via [`CacheType::from_filename()`](czkawka_core/src/common/cache/cleaning.rs:154) — Recognizes 9 cache types from their naming pattern.
- Cleaning uses a configurable interval (default: 7 days) via `CZKAWKA_CACHE_CLEANING_INTERVAL_SECONDS` env var.
- Progress is reported via `CacheProgressCleaning` struct over a channel.

### Image Processing (`image.rs`)

**File:** [`czkawka_core/src/common/image.rs`](czkawka_core/src/common/image.rs)

- [`register_image_decoding_hooks()`](czkawka_core/src/common/image.rs:17) — Registers libheif (feature-gated) and jxl-oxide decoding hooks into image-rs.
- [`decode_normal_image()`](czkawka_core/src/common/image.rs:25) — Opens file by content sniffing, not extension. Used for bad-extension files.
- [`get_dynamic_image_from_path()`](czkawka_core/src/common/image.rs:56) — The main image loader:
  1. Routes RAW files to [`get_raw_image()`](czkawka_core/src/common/image.rs:157) (uses `rawler` by default, or `libraw-rs` with `libraw` feature)
  2. Standard paths go through `decode_normal_image()`
  3. Applies optional resize via `fast_image_resize`
  4. Reads EXIF orientation via `nom-exif` and auto-rotates the image
  5. Caps image dimensions at 2 billion pixels
- [`resize_image_exact()`](czkawka_core/src/common/image.rs:122) — Resizes using `fast_image_resize` with fallback to `image-rs` Lanczos3.
- [`check_if_can_display_image()`](czkawka_core/src/common/image.rs:220) — Checks if a file extension is in the supported image formats list (including RAW and optionally HEIC).

### Video Utilities (`video_utils.rs`, `ffmpeg_utils.rs`)

**File:** [`czkawka_core/src/common/video_utils.rs`](czkawka_core/src/common/video_utils.rs)

- [`VideoMetadata`](czkawka_core/src/common/video_utils.rs:20) — Extracted video properties: `fps`, `codec`, `bitrate`, `width`, `height`, `duration`.
- [`VideoMetadata::from_path()`](czkawka_core/src/common/video_utils.rs:30) — Uses local [`ffprobe`](czkawka_core/src/helpers/ffprobe.rs) wrapper. Validates resolution against `VIDEO_RESOLUTION_LIMIT`.
- [`extract_frame_ffmpeg()`](czkawka_core/src/common/video_utils.rs:101) — Runs `ffmpeg` to extract a single frame at a given timestamp. Uses `-threads 1` for reproducibility. Returns `RgbImage`.
- [`generate_thumbnail()`](czkawka_core/src/common/video_utils.rs:148) — Creates either a single thumbnail or a grid thumbnail (tiled frames). Uses `blake3` hashing of path + size + date to name thumbnail files. Caches thumbnails.

**File:** [`czkawka_core/src/common/ffmpeg_utils.rs`](czkawka_core/src/common/ffmpeg_utils.rs)

- [`check_if_ffprobe_ffmpeg_exists()`](czkawka_core/src/common/ffmpeg_utils.rs:7) — Runs `ffmpeg -version` and `ffprobe -version` to check availability.
- [`get_working_hardware_encoders()`](czkawka_core/src/common/ffmpeg_utils.rs:32) — Probes NVENC, VAAPI, QSV, VideoToolbox, AMF by attempting a 1-frame encode. Returns the subset that works.
- [`find_vaapi_device()`](czkawka_core/src/common/ffmpeg_utils.rs:94) — Scans `/dev/dri/renderD{128..132}` for available VAAPI devices.
- [`get_available_hw_accelerations()`](czkawka_core/src/common/ffmpeg_utils.rs:146) — Runs `ffmpeg -hwaccels` and parses the output.

### Progress Reporting (`progress_data.rs`, `progress_stop_handler.rs`)

**File:** [`czkawka_core/src/common/progress_data.rs`](czkawka_core/src/common/progress_data.rs)

- [`ProgressData`](czkawka_core/src/common/progress_data.rs:73) — Struct sent from worker threads to UI: `sstage`, `checking_method`, `current_stage_idx`, `max_stage_idx`, `entries_checked`, `entries_to_check`, `bytes_checked`, `bytes_to_check`, `tool_type`.
- [`CurrentStage`](czkawka_core/src/common/progress_data.rs:101) — Enum with 30+ variants covering every stage of every tool (e.g. `DuplicateFullHashing`, `SimilarImagesCalculatingHashes`, `SameMusicComparingFingerprints`).
- [`validate()`](czkawka_core/src/common/progress_data.rs:149) — Debug assertion that validates stage index consistency and entry counts.
- Each tool's max stage index is defined in [`ToolType::get_max_stage()`](czkawka_core/src/common/progress_data.rs:234).

**File:** [`czkawka_core/src/common/progress_stop_handler.rs`](czkawka_core/src/common/progress_stop_handler.rs)

- [`ProgressThreadHandler`](czkawka_core/src/common/progress_stop_handler.rs:15) — Spawns a background thread that periodically sends `ProgressData` over a `crossbeam_channel::Sender`. Thread sleeps for 20ms between checks (`LOOP_DURATION`) and sends progress every 200ms (`SEND_PROGRESS_DATA_TIME_BETWEEN`).
- [`prepare_thread_handler_common()`](czkawka_core/src/common/progress_stop_handler.rs:62) — Creates the handler. If no sender is provided, spawns a no-op thread.
- [`check_if_stop_received()`](czkawka_core/src/common/progress_stop_handler.rs:113) — Simple atomic load of the stop flag (used everywhere inside parallel iterators).
- [`ProgressStatus`](czkawka_core/src/common/progress_stop_handler.rs:49) — `items_counter` (AtomicUsize) and `size_counter` (AtomicU64) updated from worker threads.

### Logger (`logger.rs`)

**File:** [`czkawka_core/src/common/logger.rs`](czkawka_core/src/common/logger.rs)

- [`setup_logger()`](czkawka_core/src/common/logger.rs:13) — Configures `handsome_logger` for terminal + file logging:
  - Terminal: `LevelFilter::Info` (or `Off` if `disabled_terminal_printing` and `ENABLE_TERMINAL_LOGS_IN_CLI` is not set)
  - File: `LevelFilter::Debug` to a rotating file at `<cache_folder>/<app_name>.log` (max 3 files × 100 MB)
  - Log filtering via `filtering_messages()` — only allows modules starting with `krokiet`, `czkawka`, `cedinia`, `log_panics`
  - Registers `log_panics::init()` to capture panic messages
- [`print_version_mode()`](czkawka_core/src/common/logger.rs:91) — Logs detailed version info: build mode, Rust version, OS, CPU features (SSE2/AVX2/AVX-512), libc versions, features enabled.

### Process Utilities (`process_utils.rs`)

**File:** [`czkawka_core/src/common/process_utils.rs`](czkawka_core/src/common/process_utils.rs)

- [`disable_windows_console_window()`](czkawka_core/src/common/process_utils.rs:12) — Sets `CREATE_NO_WINDOW` flag on Windows to suppress console popups for child processes.
- [`run_command_interruptible()`](czkawka_core/src/common/process_utils.rs:34) — Runs a `Command` with the ability to cancel via `stop_flag`:
  1. Spawns child process with piped stdout/stderr
  2. Two reader threads collect stdout/stderr concurrently
  3. Polls child status + stop flag in a loop (100ms intervals)
  4. Logs warnings if the command runs for 50s, 250s, 1250s, or 6000s
  5. Kills child process if stop flag is set
  6. Returns `CommandOutput { status, stdout, stderr }`

### CLI Argument Parsing (`basic_gui_cli.rs`)

**File:** [`czkawka_core/src/common/basic_gui_cli.rs`](czkawka_core/src/common/basic_gui_cli.rs)

- [`process_cli_args()`](czkawka_core/src/common/basic_gui_cli.rs:25) — Simple manual CLI parser (no `clap` to keep binary size small):
  - Supports `--help`/`-h`, `--version`/`-v`
  - `-e`/`--exclude`, `-r`/`--referenced`, `-c`/`--cache`, `-C`/`--config`
  - Returns `Option<CliResult>` with `included_items`, `excluded_items`, `referenced_items`

---

## Helper Modules (`src/helpers/`)

**File:** [`czkawka_core/src/helpers/mod.rs`](czkawka_core/src/helpers/mod.rs)

Contains generic, reusable utilities designed for transportability to other projects:

### Messages (`messages.rs`)

**File:** [`czkawka_core/src/helpers/messages.rs`](czkawka_core/src/helpers/messages.rs)

- [`Messages`](czkawka_core/src/helpers/messages.rs:7) — Accumulates `critical`, `messages`, `warnings`, `errors`. Provides:
  - `create_messages_text(limit)` — Formats with clear section headers. Supports character/line limits with truncation.
  - `extend_with_another_messages()` — Merges another `Messages` instance.
  - `print_messages_to_writer()`

### FFprobe (`ffprobe.rs`)

**File:** [`czkawka_core/src/helpers/ffprobe.rs`](czkawka_core/src/helpers/ffprobe.rs)

A copy of the `ffprobe-rs` crate (MIT licensed) — maintained locally due to upstream issue #33. Runs `ffprobe` with JSON output and deserializes into typed Rust structs:
- [`FfProbe`](czkawka_core/src/helpers/ffprobe.rs:159) — Contains `streams: Vec<Stream>` and `format: Format`.
- [`Stream`](czkawka_core/src/helpers/ffprobe.rs:166) — Codec info, dimensions, frame rates, bitrates, disposition, tags.
- [`Format`](czkawka_core/src/helpers/ffprobe.rs:260) — Container format, duration, bitrate, tags.

### Audio Checker (`audio_checker.rs`)

**File:** [`czkawka_core/src/helpers/audio_checker.rs`](czkawka_core/src/helpers/audio_checker.rs)

- [`parse_audio_file()`](czkawka_core/src/helpers/audio_checker.rs:9) — Uses `symphonia` to probe, find a supported audio track, create a decoder, and decode all packets. Returns `Ok(())` if the file is valid, or a `symphonia::Error` if broken.

### Debug Timer (`debug_timer.rs`)

**File:** [`czkawka_core/src/helpers/debug_timer.rs`](czkawka_core/src/helpers/debug_timer.rs)

- [`Timer`](czkawka_core/src/helpers/debug_timer.rs:48) — Records named checkpoints with elapsed durations. Produces a formatted report (multi-line or one-line).

### Delayed Sender (`delayed_sender.rs`)

**File:** [`czkawka_core/src/helpers/delayed_sender.rs`](czkawka_core/src/helpers/delayed_sender.rs)

- [`DelayedSender<T>`](czkawka_core/src/helpers/delayed_sender.rs:13) — A batching/throttling sender. Values sent to it replace any pending value. A background thread forwards the latest value to the underlying channel at most once per `wait_time` interval. Used for progress updates to avoid flooding the channel.

---

## Tools (`src/tools/`)

**File:** [`czkawka_core/src/tools/mod.rs`](czkawka_core/src/tools/mod.rs)

All 14 tools are declared as public sub-modules:

```rust
pub mod bad_extensions;
pub mod bad_names;
pub mod big_file;
pub mod broken_files;
pub mod duplicate;
pub mod empty_files;
pub mod empty_folder;
pub mod exif_remover;
pub mod invalid_symlinks;
pub mod same_music;
pub mod similar_images;
pub mod similar_videos;
pub mod temporary;
pub mod video_optimizer;
```

Each tool follows the same pattern:
- `mod.rs` — Entry types, parameter structs, result entry types
- `core.rs` — Implementation (`new()`, scanning methods)
- `traits.rs` — Trait implementations (`CommonData`, `Search`, `PrintResults`, `DeletingItems`, etc.)
- `tests.rs` — Unit tests

### Duplicate Finder (`duplicate/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/duplicate/mod.rs), [`core.rs`](czkawka_core/src/tools/duplicate/core.rs), [`traits.rs`](czkawka_core/src/tools/duplicate/traits.rs)

**What it does:** The most complex tool. Finds duplicate files by name, size+name, size, or full hash.

**Core algorithm:**

1. **Name mode** ([`check_files_name`](czkawka_core/src/tools/duplicate/core.rs:44)): Groups files by filename (case-sensitive or not via `case_sensitive_name_comparison`).
2. **Size+Name mode** ([`check_files_size_name`](czkawka_core/src/tools/duplicate/core.rs:131)): Groups by `(size, name)` tuple.
3. **Size mode** ([`check_files_size`](czkawka_core/src/tools/duplicate/core.rs:227)): Groups by size, optionally filters hardlinks (retains one per inode). For hash mode, this is the first pass.
4. **Hash mode** ([`check_files_hash`](czkawka_core/src/tools/duplicate/core.rs:806)):
   - **Pre-hashing** (`prehashing`): Reads first 4 KB (`PREHASHING_BUFFER_SIZE`) of each file with the chosen hash type (Blake3/Crc32/Xxh3). Cache is stored per path with inode fallback — if a file moved but has the same inode, the cached hash is reused. Only groups where ≥2 files share the same pre-hash proceed.
   - **Full hashing** ([`full_hashing`](czkawka_core/src/tools/duplicate/core.rs:663)): Full file hash. Cache again with per-path + inode fallback.
   - **Reference folders:** If enabled, files in reference directories are treated as "keep" — results show `(reference_file, [duplicates])`.

**Key constants:**
- `PREHASHING_BUFFER_SIZE`: 4 KB
- `THREAD_BUFFER_SIZE`: 2 MB (thread-local buffer for file reading)

**Hash types:**
- [`MyHasher` trait](czkawka_core/src/tools/duplicate/mod.rs:173) — Abstracts over `blake3::Hasher`, `crc32fast::Hasher`, `Xxh3`.
- [`hash_calculation()`](czkawka_core/src/tools/duplicate/mod.rs:258) — Reads file in loop, updates hasher, checks stop flag.
- [`hash_calculation_limit()`](czkawka_core/src/tools/duplicate/mod.rs:228) — Reads at most `limit` bytes.

**Cache:** Uses `BTreeMap<u64, Vec<DuplicateEntry>>` — groups by file size. Two cache files per hash type: prehash and full.

### Similar Images (`similar_images/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/similar_images/mod.rs), [`core.rs`](czkawka_core/src/tools/similar_images/core.rs)

**What it does:** Finds visually similar images using perceptual hashing.

**Core algorithm:**

1. **File collection** ([`check_for_similar_images`](czkawka_core/src/tools/similar_images/core.rs:42)): Groups by size, filters hardlinks in parallel.
2. **Hashing** ([`hash_images`](czkawka_core/src/tools/similar_images/core.rs:125)): For each image:
   - Loads image via `get_dynamic_image_from_path()` (handles RAW, HEIC, JXL, EXIF auto-rotation)
   - Computes perceptual hash using `image_hasher` with configurable:
     - `hash_size`: 8, 16, 32, or 64 bits
     - `hash_alg`: Mean, Gradient, Blockhash, VertGradient, DoubleGradient, Median
     - `image_filter`: Lanczos3, Nearest, Triangle, Gaussian, CatmullRom
   - Cache by path + inode fallback for hardlinks
3. **BK-tree search** ([`find_similar_hashes`](czkawka_core/src/tools/similar_images/core.rs:466)):
   - For tolerance 0: exact hash match only
   - For tolerance > 0:
     - Builds a BK-tree with `hamming_bitwise_fast` distance metric
     - Splits hashes into base (to search from) and compare (to match against)
     - Processes in chunks to limit memory: chunk size = `max(500, len / (cpus * 4))`
     - Uses a reparenting algorithm in [`connect_results_simplified()`](czkawka_core/src/tools/similar_images/core.rs:383) to build optimal parent-child relationships
4. **Post-processing:**
   - Optionally excludes items with same size (`exclude_images_with_same_size`)
   - Optionally excludes items with same resolution (`exclude_images_with_same_resolution`)
   - Reference folder handling: selects best quality reference image

**Similarity presets** (`SIMILAR_VALUES`): 4×6 matrix mapping hash sizes to 6 similarity thresholds (Original → Minimal).

### Similar Videos (`similar_videos/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/similar_videos/mod.rs), [`core.rs`](czkawka_core/src/tools/similar_videos/core.rs)

**What it does:** Finds similar videos using `vid_dup_finder_lib`.

**Core algorithm:**

1. **File collection** ([`check_for_similar_videos`](czkawka_core/src/tools/similar_videos/core.rs:38)): Groups by size, filters hardlinks.
2. **Hashing** ([`sort_videos`](czkawka_core/src/tools/similar_videos/core.rs:134)):
   - Uses `VideoHashBuilder` with configurable:
     - `skip_forward_amount`: 0–300s (default 15s)
     - `duration`: 2–60s (default 10s)
     - `crop_detect`: None, Letterbox, Motion
   - Cache by path + inode fallback (fixes `VideoHash.src_path` via JSON serialization)
3. **Matching** ([`match_groups_of_videos`](czkawka_core/src/tools/similar_videos/core.rs:341)):
   - Calls `vid_dup_finder_lib::search()` with tolerance mapped as `tolerance / 40.0` (range 0.0–0.5)
   - Computes Hamming distance between matched videos
   - Optionally excludes same-size/same-resolution
4. **Thumbnail generation** ([`create_thumbnails`](czkawka_core/src/tools/similar_videos/core.rs:252)):
   - Creates grid or single thumbnails using `generate_thumbnail()` in parallel

### Same Music (`same_music/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/same_music/mod.rs), [`core.rs`](czkawka_core/src/tools/same_music/core.rs)

**What it does:** Finds duplicate music files by tag comparison or audio fingerprinting.

**Two modes:**

1. **AudioTags** — Compares metadata fields:
   - Uses [`lofty`](https://crates.io/crates/lofty) to read tags (TrackTitle, TrackArtist, Year, Genre)
   - Bitmask: `MusicSimilarity` flags (TRACK_TITLE, TRACK_ARTIST, YEAR, LENGTH, GENRE, BITRATE)
   - Approximate comparison strips parenthetical content and non-alphanumeric characters
   - Iteratively filters the candidate list through each enabled criterion ([`check_music_item`](czkawka_core/src/tools/same_music/core.rs:502))
2. **AudioContent** — Chromaprint fingerprinting:
   - Uses [`symphonia`](https://crates.io/crates/symphonia) to decode audio and [`rusty_chromaprint`](https://crates.io/crates/rusty-chromaprint) to compute fingerprints (`Fingerprinter`)
   - Optionally pre-filters by track title similarity (`compare_fingerprints_only_with_similar_titles`)
   - `match_fingerprints()` compares fingerprints, retaining segments with duration > `minimum_segment_duration` and score < `maximum_difference`
   - Parallized comparison using rayon

**Name simplification:** `get_simplified_name()` strips parenthetical content, emoji, and special characters; falls back to deunicode.

### Big File (`big_file/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/big_file/mod.rs), [`core.rs`](czkawka_core/src/tools/big_file/core.rs)

**What it does:** Finds the N largest (or smallest) files.

**Algorithm:** Collects all files via `DirTraversalBuilder`, then sorts by size in parallel using `par_sort_unstable_by_key()` and truncates to `number_of_files_to_check`. Supports `SearchMode::BiggestFiles` or `SearchMode::SmallestFiles`.

### Empty Files (`empty_files/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/empty_files/mod.rs), [`core.rs`](czkawka_core/src/tools/empty_files/core.rs)

**What it does:** Finds files with size == 0.

**Algorithm:** Uses `DirTraversalBuilder` with `minimal_file_size=0` and `maximal_file_size=0`, collects all matches.

### Empty Folder (`empty_folder/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/empty_folder/mod.rs), [`core.rs`](czkawka_core/src/tools/empty_folder/core.rs)

**What it does:** Finds empty folders (recursively empty).

**Algorithm:** Custom parallel traversal (not using `DirTraversalBuilder`):
1. Starts from included directories, marking each `FolderEmptiness::Maybe`
2. For each folder, reads all entries in parallel batches
3. Non-empty folders and their parents are marked `FolderEmptiness::No` via [`set_as_not_empty_folder()`](czkawka_core/src/tools/empty_folder/core.rs:174) (walks up parent chain)
4. Final [`optimize_folders()`](czkawka_core/src/tools/empty_folder/core.rs:38) removes sub-folders of other empty folders (only top-level empty folders remain)

### Temporary Files (`temporary/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/temporary/mod.rs), [`core.rs`](czkawka_core/src/tools/temporary/core.rs)

**What it does:** Finds temporary/cache files by extension matching.

**Default extensions:** `#`, `thumbs.db`, `.bak`, `~`, `.tmp`, `.temp`, `.ds_store`, `.crdownload`, `.part`, `.cache`, `.dmp`, `.download`, `.partial`.

**Algorithm:** Custom parallel traversal (not `DirTraversalBuilder`) — for each file, checks if the lowercase filename ends with any configured extension. Supports configurable extensions via `TemporaryParameters`.

### Broken Files (`broken_files/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/broken_files/mod.rs), [`core.rs`](czkawka_core/src/tools/broken_files/core.rs)

**What it does:** Validates files by opening/decoding them with the appropriate library.

**Checked types** (configurable via `CheckedTypes` bitflags):
- **Image** — Opens via `image::open()`, checks for zero dimensions
- **Archive (ZIP)** — Opens via `zip::ZipArchive::new()`
- **Audio** — Decodes all packets via `symphonia` ([`audio_checker::parse_audio_file`](czkawka_core/src/helpers/audio_checker.rs:9))
- **PDF** — Loads via `lopdf::Document::load_from()`
- **Video (ffprobe)** — Runs `ffprobe -v error` and checks for known error messages
- **Video (ffmpeg)** — Runs `ffmpeg -v error -xerror` and checks against a list of known error/warning patterns

**Cache:** Uses `load_and_split_cache_generalized_by_path` to avoid re-checking unchanged files.

### Bad Extensions (`bad_extensions/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/bad_extensions/mod.rs), [`core.rs`](czkawka_core/src/tools/bad_extensions/core.rs), [`workarounds.rs`](czkawka_core/src/tools/bad_extensions/workarounds.rs), [`traits.rs`](czkawka_core/src/tools/bad_extensions/traits.rs)

**What it does:** Detects files whose extension doesn't match their actual content type.

**Algorithm:**
1. Uses [`infer`](https://crates.io/crates/infer) to detect MIME type from file content
2. Uses [`mime_guess`](https://crates.io/crates/mime_guess) to get all valid extensions for that MIME type
3. Checks if the current extension is in the valid set
4. Also checks workarounds (e.g., `.jpg` ↔ `.jpeg`, `.tif` ↔ `.tiff`)
5. Can fix via [`fix_bad_extensions()`](czkawka_core/src/tools/bad_extensions/core.rs:208) — renames files to the proper extension

**Edge cases:** Ignores extensions >10 chars, handles files without extensions via `include_files_without_extension` parameter.

### Bad Names (`bad_names/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/bad_names/mod.rs), [`core.rs`](czkawka_core/src/tools/bad_names/core.rs)

**What it does:** Detects files with problematic names.

**Configurable checks** (`NameIssues`):
- `uppercase_extension` — Extensions should be lowercase
- `emoji_used` — Removes emoji characters
- `space_at_start_or_end` — Trims leading/trailing whitespace
- `non_ascii_graphical` — Uses `deunicode` to transliterate non-ASCII
- `restricted_charset_allowed` — Only allows specified ASCII chars + alphanumeric (default: `_`, `-`, ` `, `.`)
- `remove_duplicated_non_alphanumeric` — Deduplicates consecutive non-alphanumeric characters (e.g., `a---b` → `a-b`)

**Algorithm:** Collects files, runs [`check_and_generate_new_name()`](czkawka_core/src/tools/bad_names/core.rs:130) in parallel. Can fix via `fix_bad_names()`.

### Invalid Symlinks (`invalid_symlinks/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/invalid_symlinks/mod.rs), [`core.rs`](czkawka_core/src/tools/invalid_symlinks/core.rs)

**What it does:** Finds broken symlinks.

**Algorithm:** Uses `DirTraversalBuilder` with `Collect::InvalidSymlinks` mode. For each symlink found:
1. Reads the link target via `read_link()`
2. Follows the chain up to `MAX_NUMBER_OF_SYMLINK_JUMPS` (20)
3. Returns `NonExistentFile` if the target doesn't exist, `InfiniteRecursion` if cycle detected

### EXIF Remover (`exif_remover/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/exif_remover/mod.rs), [`core.rs`](czkawka_core/src/tools/exif_remover/core.rs)

**What it does:** Lists and optionally removes EXIF metadata from images.

**Algorithm:**
1. Collects files with supported extensions (`EXIF_FILES_EXTENSIONS`)
2. Uses `little_exif` to read metadata
3. Extracts tag name, u16 code, and tag group (EXIF, GPS, INTEROP, GENERIC)
4. Can fix via `fix_files()` — removes tags from the file, optionally creating a copy (`.czkawka_cleaned_exif.<ext>`)

**Special handling:** TIFF files exclude essential TIFF tags (ImageWidth, ImageHeight, etc.) from display/removal.

### Video Optimizer (`video_optimizer/`)

**Files:** [`mod.rs`](czkawka_core/src/tools/video_optimizer/mod.rs), [`core.rs`](czkawka_core/src/tools/video_optimizer/core.rs), [`core/video_converter.rs`](czkawka_core/src/tools/video_optimizer/core/video_converter.rs), [`core/video_cropper.rs`](czkawka_core/src/tools/video_optimizer/core/video_cropper.rs)

**What it does:** Analyzes videos for optimization (transcoding or cropping) and performs the operation.

**Two modes:**

1. **VideoTranscode** — Identifies videos that use non-optimal codecs. Configuration:
   - `excluded_codecs` — Codecs considered already optimal (default: `["hevc", "h265", "av1", "vp9"]`)
   - Thumbnail generation support
2. **VideoCrop** — Identifies videos with black bars or static borders:
   - `crop_detect`: BlackBars (detects black pixels) or StaticContent (detects static borders)
   - `black_pixel_threshold`: 0–128 (pixel value considered "black")
   - `black_bar_min_percentage`: 50–100%
   - `max_samples`: 5–1000 frames to sample
   - `min_crop_size`: 1–1000 pixels minimum crop dimension

**Hardware encoder support** (`HardwareEncoder`):
- `None` (software ×264/×265/SVT-AV1/libvpx-vp9)
- `NVENC` (H264, H265, AV1)
- `VAAPI` (H264, H265)
- `QSV` (H264, H265, AV1)
- `VideoToolbox` (H264, H265)
- `AMF` (H264, H265, AV1)

Each encoder has specific quality arguments (`-cq:v`, `-global_quality`, `-q:v`, CQP mode).

**Noise reduction:** Supports `hqdn3d` filter with configurable strength.

---

## Benchmarks (`benches/`)

**File:** [`czkawka_core/benches/hash_calculation_benchmark.rs`](czkawka_core/benches/hash_calculation_benchmark.rs)

Uses `criterion` to benchmark file hashing with different buffer sizes:
- `benchmark_hash_calculation_vec<16MB, 16KB>` — Vec buffer, 16 KB chunks
- `benchmark_hash_calculation_vec<16MB, 1MB>` — Vec buffer, 1 MB chunks
- `benchmark_hash_calculation_arr<16MB, 16KB>` — Stack array buffer, 16 KB chunks
- `benchmark_hash_calculation_arr<16MB, 1MB>` — Stack array buffer, 1 MB chunks

---

## Test Resources (`test_resources/`)

Located at [`czkawka_core/test_resources/`](czkawka_core/test_resources/):
- **Audio** (`audio/`): 5 MP3 files for music similarity testing (`base.mp3`, `base_end.mp3`, `base_low_quality.mp3`, `base_messed.mp3`, `base_start.mp3`)
- **Images** (`images/`): 3 JPEG files for image testing (`normal.jpg`, `normal2.jpg`, `rotated.jpg`)

---

## Internationalization (`i18n/`)

**Location:** [`czkawka_core/i18n/`](czkawka_core/i18n/)

28 language directories, each containing a `czkawka_core.ftl` file:

| Code | Language | Code | Language |
|---|---|---|---|
| `ar` | Arabic | `ko` | Korean |
| `bg` | Bulgarian | `nl` | Dutch |
| `cs` | Czech | `no` | Norwegian |
| `de` | German | `pl` | Polish |
| `el` | Greek | `pt-BR` | Portuguese (BR) |
| `en` | English (source) | `pt-PT` | Portuguese (PT) |
| `es-ES` | Spanish | `ro` | Romanian |
| `fa` | Persian | `ru` | Russian |
| `fr` | French | `sv-SE` | Swedish |
| `hi` | Hindi | `tr` | Turkish |
| `id` | Indonesian | `uk` | Ukrainian |
| `it` | Italian | `vi` | Vietnamese |
| `ja` | Japanese | `zh-CN` | Chinese (Simplified) |
| | | `zh-TW` | Chinese (Traditional) |

The English [`.ftl` file](czkawka_core/i18n/en/czkawka_core.ftl) defines ~110 translation keys covering:
- Similarity labels (Original, Very High, High, Medium, Small, Very Small, Minimal)
- Error messages (cannot open dir, cannot read metadata, etc.)
- Path validation warnings
- Cache messages
- Image/video/audio processing errors
- EXIF tag groups
- Video codec names
- Progress stage labels

**Important:** Only the English file is edited directly. Other languages are managed via Crowdin and overwritten on sync.
