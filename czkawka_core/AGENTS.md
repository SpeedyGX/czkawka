# czkawka_core – Architecture Guide

## Overview

`czkawka_core` is the shared scanning engine used by all frontends. It has no UI
dependency. Every scanning tool is implemented here; frontends only configure the
tool structs and drive them via the `Search` trait.

`TOOLS_NUMBER = 14` (defined in `src/lib.rs`).

---

## Source Layout

```
czkawka_core/src/
├── lib.rs                         # Crate root; TOOLS_NUMBER constant
├── localizer_core.rs              # Fluent i18n loader (flc! macro)
├── common/
│   ├── mod.rs                     # Shared helpers (format_time, split_path, …)
│   ├── audio_fingerprint.rs       # Chromaprint audio fingerprint extraction (rusty-chromaprint)
│   ├── traits.rs                  # Core traits: Search, CommonData, PrintResults, …
│   ├── tool_data.rs               # CommonToolData struct, DeleteMethod enum
│   ├── model.rs                   # ToolType, CheckingMethod, FileEntry
│   ├── progress_data.rs           # ProgressData, CurrentStage enum
│   ├── progress_stop_handler.rs   # ProgressThreadHandler, check_if_stop_received
│   ├── dir_traversal.rs           # DirTraversalBuilder, DirTraversalResult
│   ├── cache.rs                   # Generic load/save cache (bincode + JSON)
│   ├── cache/
│   │   └── cleaning.rs            # Outdated cache cleanup
│   ├── config_cache_path.rs       # Platform config/cache path lookup
│   ├── directories.rs             # Directories struct (included/excluded/reference)
│   ├── extensions.rs              # Extensions struct (allowed/excluded filtering)
│   ├── items.rs                   # ExcludedItems (glob pattern matching)
│   ├── consts.rs                  # Extension lists: IMAGE_RS_EXTENSIONS, …
│   ├── ffmpeg_utils.rs            # FFmpeg invocation helpers
│   ├── video_utils.rs             # Video metadata extraction
│   ├── image.rs                   # Image loading helpers
│   ├── process_utils.rs           # Child-process helpers
│   ├── logger.rs                  # Logging configuration
│   └── basic_gui_cli.rs           # GUI/CLI argument parsing (paths, tool, preset, start-scan flags)
├── tools/
│   ├── mod.rs                     # Re-exports all tool modules
│   ├── duplicate/                 # Hash/name/size duplicate detection
│   ├── empty_files/
│   ├── empty_folder/
│   ├── big_file/
│   ├── similar_images/            # Perceptual hashing (image_hasher)
│   ├── similar_videos/            # Visual (frame hash) + audio-fingerprint video similarity
│   ├── same_music/                # Audio tag + chromaprint fingerprint
│   ├── broken_files/              # Archive/PDF/audio/image/font/markup validation
│   ├── bad_extensions/            # Extension vs magic-number mismatch
│   ├── bad_names/                 # Naming policy checks
│   ├── invalid_symlinks/
│   ├── temporary/
│   ├── exif_remover/
│   └── video_optimizer/           # Crop detection + FFmpeg transcoding
└── helpers/
    ├── messages.rs                # Messages struct (errors, warnings, info)
    ├── delayed_sender.rs          # Rate-limited progress sender
    ├── audio_checker.rs           # Audio file validation
    ├── ffprobe.rs                 # ffprobe JSON output parsing
    └── debug_timer.rs             # Debug-build timing
```

---

## Tool Module Layout

Each tool lives in its own directory with three files:

| File | Content |
|------|---------|
| `mod.rs` | Tool struct + `Info` struct + `Parameters` struct (if needed) |
| `core.rs` | Internal scanning functions (`check_files_*`, `hash_calculation`, …) |
| `traits.rs` | Trait implementations: `Search`, `CommonData`, `DeletingItems`, `PrintResults` |

Example — `EmptyFiles`:

```
src/tools/empty_files/
├── mod.rs      # pub struct EmptyFiles { common_data, information, empty_files }
├── core.rs     # fn check_files() → WorkContinueStatus
└── traits.rs   # impl Search, CommonData, PrintResults, DeletingItems, AllTraits
```

### How to add a new tool

1. **Create the module dir:** `src/tools/<tool_name>/` with three files:

   | File | What goes there |
   |------|-----------------|
   | `mod.rs` | Tool struct holding `common_data: CommonToolData`, `information: Info` (results), `parameters: Parameters`. Implement `new(params: Parameters) -> Self`. |
   | `core.rs` | Scanning logic. Functions named `check_files_*` that take `&mut self, stop_flag, progress_sender` and return `WorkContinueStatus`. |
   | `traits.rs` | Implement `Search`, `CommonData`, `PrintResults`, `DeletingItems` (or reuse the default delete strategies from `CommonData`), and `AllTraits`. |

2. **Add to `src/tools/mod.rs`:** `pub mod <tool_name>;`

3. **Add to `ToolType` enum** in `src/common/model.rs` and bump `TOOLS_NUMBER` in `src/lib.rs`.

4. **Wire in each frontend:**
   - **CLI:** Add a subcommand in `commands.rs` + dispatch function in `main.rs`.
   - **Krokiet:** Add `connect_scan/<tool>.rs` + model field in `SharedModels` + `zeroing_all_models()` entry + `ActiveTab` variant.
   - **Web:** Add API endpoint + request struct + serialize function in `scan.rs`.

### Tool design conventions

- **`prepare_items()`** must be called before `search()` — it validates directories and extensions.
- **`check_if_stop_received(stop_flag)`** must be polled in every hot loop inside `core.rs`.
- **Progress updates** use `ProgressThreadHandler` (collected) or atomic counters with `DelayedSender`.
- **Caching** (if used): define a `CACHE_<TOOL>_VERSION` constant, call `load_cache_from_file_generalized_by_path` / `save_cache_to_file_generalized`.
- **`#[fun_time(message = "...", level = "debug")]`** on every public method for debug-build timing.

### Minimal template

```rust
// mod.rs
pub struct MyTool {
    common_data: CommonToolData,
    information: Info,
    parameters: Parameters,
}
pub struct Info { /* results fields */ }
pub struct Parameters { /* tool-specific settings */ }
impl MyTool {
    pub fn new(parameters: Parameters) -> Self {
        Self {
            common_data: CommonToolData::new(ToolType::MyTool),
            information: Info::default(),
            parameters,
        }
    }
}
```

```rust
// core.rs
pub fn check_files(&mut self, stop_flag: &Arc<AtomicBool>,
                    progress_sender: Option<&Sender<ProgressData>>) -> WorkContinueStatus {
    // 1. prepare_items()
    // 2. DirTraversalBuilder or custom traversal
    // 3. Process results → self.information
    // 4. Return WorkContinueStatus::Continue (or Stop)
}
```

```rust
// traits.rs
impl CommonData for MyTool { /* delegate get_cd/get_cd_mut to self.common_data */ }
impl Search for MyTool { fn search(...) { self.check_files(...); } }
impl PrintResults for MyTool { /* serialize self.information */ }
impl DeletingItems for MyTool { /* or use the default impl from CommonData */ }
impl AllTraits for MyTool {}
impl DebugPrint for MyTool { /* println! debug info */ }
```

---

## Core Traits

### `traits.rs` — behaviour contracts

```rust
// src/common/traits.rs
pub trait DebugPrint {
    fn debug_print(&self);
}

pub trait Search {
    fn search(&mut self, stop_flag: &Arc<AtomicBool>,
              progress_sender: Option<&Sender<ProgressData>>);
}

pub trait DeletingItems {
    #[must_use]
    fn delete_files(&mut self, stop_flag: &Arc<AtomicBool>,
                    progress_sender: Option<&Sender<ProgressData>>) -> WorkContinueStatus;
}

pub trait FixingItems {
    type FixParams;
    fn fix_items(&mut self, stop_flag: &Arc<AtomicBool>,
                 progress_sender: Option<&Sender<ProgressData>>, fix_params: Self::FixParams);
}

pub trait ResultEntry {
    fn get_path(&self) -> &Path;
    fn get_modified_date(&self) -> u64;
    fn get_size(&self) -> u64;
    fn get_inode(&self) -> u64;   // default: 0 (non-Unix platforms)
}

pub trait PrintResults: CommonData {
    fn write_results<T: Write>(&self, writer: &mut T) -> io::Result<()>;
    fn write_base_search_paths<T: Write>(&self, writer: &mut T) -> io::Result<()>;
    fn print_results_to_output(&self);                               // stdout (CLI only)
    fn print_results_to_file(&self, file_name: &str) -> io::Result<()>;
    fn print_results_to_writer<T: Write>(&self, writer: &mut T) -> io::Result<()>;
    fn save_results_to_file_as_json(&self, file: &str, pretty: bool) -> io::Result<()>;
    fn save_all_in_one(&self, folder: &str, base_name: &str) -> io::Result<()>;
    //  ^ writes .txt + _pretty.json + _compact.json
}

pub trait AllTraits: DebugPrint + PrintResults + DeletingItems + CommonData + Search {}
```

### `tool_data.rs` — data contracts

```rust
// src/common/tool_data.rs
pub enum DeleteMethod {
    None, Delete, AllExceptNewest, AllExceptOldest, OneOldest, OneNewest,
    HardLink, AllExceptBiggest, AllExceptSmallest, OneBiggest, OneSmallest,
}

pub trait CommonData {
    type Info;
    type Parameters;

    fn get_information(&self) -> Self::Info;
    fn get_params(&self) -> Self::Parameters;
    fn get_cd(&self) -> &CommonToolData;
    fn get_cd_mut(&mut self) -> &mut CommonToolData;
    fn get_check_method(&self) -> CheckingMethod { CheckingMethod::None }
    fn found_any_items(&self) -> bool;

    // ~30 setters/getters for: hide_hard_links, dry_run, use_cache,
    //   delete_outdated_cache, stopped_search, file sizes, recursive_search,
    //   use_reference_folders, delete_method, move_to_trash,
    //   included/excluded/reference paths, extensions, excluded items

    /// Validates and optimizes directories + extensions. Call before search().
    fn prepare_items(&mut self, tool_extensions: Option<&[&str]>) -> Result<(), ()>;

    // Built-in delete strategies (used by tools that don't override DeletingItems):
    fn delete_simple_elements_and_add_to_messages<T: ResultEntry>(
        &mut self, stop_flag: &Arc<AtomicBool>,
        progress_sender: Option<&Sender<ProgressData>>,
        delete_item_type: DeleteItemType<T>,
    ) -> WorkContinueStatus;

    fn delete_advanced_elements_and_add_to_messages<T: ResultEntry + Clone>(
        &mut self, stop_flag: &Arc<AtomicBool>,
        progress_sender: Option<&Sender<ProgressData>>,
        files_to_process: Vec<Vec<T>>,
    ) -> WorkContinueStatus;
}
```

### Key supporting types (`src/common/model.rs`)

```rust
pub enum WorkContinueStatus { Continue, Stop }

pub enum CheckingMethod {
    None, Name, SizeName, Size, Hash, AudioTags, AudioContent, VideoAudioContent,
}
// VideoAudioContent selects the SimilarVideos audio-fingerprint mode (audio path, no ffmpeg).

pub enum HashType { Blake3, Crc32, Xxh3 }

pub struct FileEntry {
    pub path: PathBuf,
    pub size: u64,
    pub modified_date: u64,
    pub inode: u64,
}
// FileEntry implements ResultEntry — used by all tools as the standard result item.
```

---

## CommonToolData (`src/common/tool_data.rs`)

```rust
pub struct CommonToolData {
    pub(crate) tool_type: ToolType,
    pub(crate) text_messages: Messages,        // Accumulated warnings / errors
    pub(crate) directories: Directories,       // Included / excluded / reference paths
    pub(crate) extensions: Extensions,         // Allowed / excluded extensions
    pub(crate) excluded_items: ExcludedItems,  // Glob patterns (e.g. "*/.*")
    pub(crate) recursive_search: bool,
    pub(crate) delete_method: DeleteMethod,
    pub(crate) maximal_file_size: u64,
    pub(crate) minimal_file_size: u64,
    pub(crate) stopped_search: bool,
    pub(crate) use_cache: bool,
    pub(crate) delete_outdated_cache: bool,
    pub(crate) save_also_as_json: bool,
    pub(crate) use_reference_folders: bool,
    pub(crate) dry_run: bool,
    pub(crate) move_to_trash: bool,
    pub(crate) hide_hard_links: bool,
}
```

---

## DirTraversal (`src/common/dir_traversal.rs`)

Builder-pattern filesystem traversal used by all tools:

```rust
let result = DirTraversalBuilder::new()
    .common_data(&self.common_data)
    .group_by(|fe: &FileEntry| fe.size)   // Groups entries by this key
    .stop_flag(stop_flag)
    .progress_sender(progress_sender)
    .checking_method(CheckingMethod::Size)
    .build()
    .run();

match result {
    DirTraversalResult::SuccessFiles { grouped_file_entries, warnings } => { … }
    DirTraversalResult::Stopped => return WorkContinueStatus::Stop,
}
```

**Internals:**
- Rayon `into_par_iter().with_max_len(2)` for parallel folder processing.
- Two-phase: visit root dirs/files first, then recurse batch by batch.
- Applies extension, exclusion, and size filters during traversal.
- On Unix: optional filesystem-boundary checking (`exclude_other_filesystems`).
- Progress tracked via `ProgressThreadHandler` (dedicated thread, 200 ms interval).

---

## Progress Reporting (`src/common/progress_stop_handler.rs`)

```rust
pub struct ProgressData {
    pub sstage: CurrentStage,       // Current operation
    pub checking_method: CheckingMethod,  // e.g. Hash, AudioTags (disambiguates SameMusic/Duplicate)
    pub current_stage_idx: u8,      // Index of current stage
    pub max_stage_idx: u8,          // Max stages for this tool
    pub entries_checked: usize,
    pub entries_to_check: usize,
    pub bytes_checked: u64,
    pub bytes_to_check: u64,
    pub tool_type: ToolType,
}
```

`ProgressThreadHandler` spawns a background thread that polls `AtomicUsize`/`AtomicU64`
counters and sends `ProgressData` to the frontend channel every ~200 ms.

Call `handler.increase_items(n)` / `handler.increase_size(n)` from rayon tasks
(using `Relaxed` ordering — fast, no synchronization overhead).

---

## Cancellation

```rust
// In hot paths:
if check_if_stop_received(stop_flag) {
    return WorkContinueStatus::Stop;  // or break / return None in rayon
}
```

`stop_flag` is `Arc<AtomicBool>` with `Relaxed` ordering — sufficient for simple
"should I stop?" polling without synchronization cost. The frontend sets it to
`true`; the backend polls and stops gracefully.

---

## Cache (`src/common/cache.rs`)

```rust
// Save
save_cache_to_file_generalized::<T>(
    cache_file_name,    // e.g. "cache_duplicates.bin"
    &btree_map,         // BTreeMap<String, T> (String = canonical path)
    save_also_as_json,
    minimum_file_size,
);

// Load
let (messages, opt_cache) =
    load_cache_from_file_generalized_by_path::<T>(
        cache_file_name,
        delete_outdated_cache,
        &used_files,    // Current BTreeMap to validate against
    );
```

- Serialized with `bincode` (binary). Optionally also as `.json`.
- Cached entries validated by path + size + mtime on load.
- 8 GB memory limit on serialization.
- Each tool has its own version constant (`CACHE_DUPLICATE_VERSION`, …).
- Similar Videos keeps two independent caches that must not be merged: the visual-hash cache
  (`cache_similar_videos_<CACHE_VIDEO_VERSION>__….bin`, `VideosEntry`, loaded with the inode fallback
  `resolve_inode_cache_entries`) and the audio-fingerprint cache
  (`cache_similar_videos_audio_<CACHE_VERSION>.bin`, `VideoAudioEntry`).

---

## Rayon Usage Patterns

```rust
// Directory traversal
folders.into_par_iter().with_max_len(2).map(|dir| { … }).while_some().collect();

// Deletion with early exit
items.into_par_iter().map(|e| {
    if check_if_stop_received(stop_flag) { return None; }
    // … process e …
    Some(result)
}).while_some().flatten().collect()
```

Thread count is globally controlled via `set_number_of_threads(n)` which stores
to a `LazyLock<Mutex<Option<usize>>>` and is applied via rayon's thread pool.

---

## ToolType Enum (`src/common/model.rs`)

```rust
pub enum ToolType {
    Duplicate, EmptyFolders, EmptyFiles, InvalidSymlinks,
    BrokenFiles, BadExtensions, BadNames, BigFile, SameMusic,
    SimilarImages, SimilarVideos, TemporaryFiles, ExifRemover,
    VideoOptimizer,
    #[default]
    None,
}
```

Tools that support reference directories: `Duplicate`, `SameMusic`,
`SimilarImages`, `SimilarVideos` (`may_use_reference_paths()`).

---

## Key Dependencies

| Crate | Purpose |
|-------|---------|
| `rayon` | Parallel iterators |
| `crossbeam-channel` | Progress channels |
| `blake3` | Fast file hashing |
| `image` + `image_hasher` | Image loading + perceptual hash |
| `lofty` | Audio tag reading |
| `symphonia` | Audio decoding |
| `rusty-chromaprint` | Audio fingerprinting |
| `vid_dup_finder_lib` | Video similarity |
| `bincode` | Cache serialization |
| `zip`, `sevenz-rust2`, `tar`, `flate2`, `ruzstd`, `bzip2-rs`, `lzma-rs` | Archive validation (ZIP, 7z, tar, gz, zst, bz2, xz) |
| `ttf-parser` | Font validation |
| `quick-xml`, `toml`, `yaml-rust2`, `usvg` | Markup validation (XML/SVG, TOML, YAML; JSON via `serde_json`) |
| `i18n-embed` + `rust-embed` | Fluent translations |
| `trash` | Move-to-trash |
| `directories-next` | Config/cache path |
| `fun_time` | `#[fun_time]` timing attribute |

Optional (behind features):
- `heif` → `libheif-rs` – HEIC/HEIF image support
- `libraw` → `rawler` / `libraw-rs` – RAW photo support
- `libavif` – AVIF image support
- `xdg_portal_trash` – FlatPak trash via XDG portal

---

## Child DOX Index

None (leaf node — internal modules `common/`, `tools/`, `helpers/` are not durable boundaries).
