# czkawka_core – Architecture Guide

## Overview

`czkawka_core` is the shared scanning engine used by all frontends. It has no UI
dependency. Every scanning tool is implemented here; frontends only configure the
tool structs and drive them via the `Search` trait.

`TOOLS_NUMBER = 14` (defined in `src/lib.rs`).

---

## Source Layout

Shared-infrastructure entry points (the crate has no UI dependency):

- `src/lib.rs:13` — crate root; `TOOLS_NUMBER = 14`.
- `src/common/traits.rs:143` — the `Search` trait every tool implements.
- `src/common/tool_data.rs:23` (`CommonToolData`) and `src/common/tool_data.rs:122` (`CommonData`) —
  per-tool state and its accessor contract.
- `src/common/dir_traversal.rs:39` — `DirTraversalBuilder`, the shared filesystem traversal.
- `src/common/progress_stop_handler.rs:15` — `ProgressThreadHandler`, the progress thread.
- `src/tools/<tool>/` — one directory per tool; `src/helpers/` — messages, ffprobe and timing helpers;
  `src/localizer_core.rs` — Fluent loader (`flc!`).

Module-by-module layout is a graph query away; do not restate it here (see the structural-navigation
rules in the root AGENTS.md).

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

---

## Core Traits

### `traits.rs` — behaviour contracts

`src/common/traits.rs` defines `DebugPrint`, `Search`, `DeletingItems`, `FixingItems`, `ResultEntry`,
`PrintResults` and `AllTraits` (`DebugPrint + PrintResults + DeletingItems + CommonData + Search`) —
the bundle every tool implements.

- `ResultEntry::get_inode()` defaults to `0` on non-Unix platforms.
- `PrintResults::print_results_to_output()` writes to stdout and is used by the CLI only;
  `save_all_in_one()` writes `.txt` + `_pretty.json` + `_compact.json`.

Signatures and the full method list: graph query.

### `tool_data.rs` — data contracts

`CommonData` (`src/common/tool_data.rs:122`) is the accessor contract implemented by every tool:
`get_information`, `get_params`, `get_cd`/`get_cd_mut`, `get_check_method`, `found_any_items`,
`prepare_items` (validates and optimizes directories + extensions) plus the setters for paths,
extensions, cache, delete and file-size options.

It also carries the built-in delete strategies `delete_simple_elements_and_add_to_messages` and
`delete_advanced_elements_and_add_to_messages`, reused by tools that do not implement their own
`DeletingItems`. `DeleteMethod` holds the user-visible delete strategies: `None`, `Delete`,
`AllExceptNewest`, `AllExceptOldest`, `OneOldest`, `OneNewest`, `HardLink`, `AllExceptBiggest`,
`AllExceptSmallest`, `OneBiggest`, `OneSmallest`.

### Key supporting types (`src/common/model.rs`)

- `WorkContinueStatus` — `Continue` / `Stop`.
- `CheckingMethod` — `None`, `Name`, `SizeName`, `Size`, `Hash`, `AudioTags`, `AudioContent`,
  `VideoAudioContent`; `VideoAudioContent` selects the `SimilarVideos` audio-fingerprint mode
  (audio path, no ffmpeg).
- `HashType` — `Blake3`, `Crc32`, `Xxh3`.
- `FileEntry` (`path`, `size`, `modified_date`, `inode`) implements `ResultEntry` and is the standard
  result item for all tools.

Definitions and callers: graph query.

---

## CommonToolData (`src/common/tool_data.rs`)

`CommonToolData` (`src/common/tool_data.rs:23`) is the per-tool state bag: tool type,
`Messages` (`src/helpers/messages.rs:7`, accumulated warnings/errors), `Directories`, `Extensions`,
`ExcludedItems`, `recursive_search`, `DeleteMethod`, min/max file size, `stopped_search`, `use_cache`,
`delete_outdated_cache`, `save_also_as_json`, `use_reference_folders`, `dry_run`, `move_to_trash`,
`hide_hard_links`.

Field-level detail: graph query.

---

## DirTraversal (`src/common/dir_traversal.rs`)

`DirTraversalBuilder` (`src/common/dir_traversal.rs:39`) is the builder-pattern traversal used by all
tools: `group_by(|fe: &FileEntry| …)` sets the grouping key, and `run()` yields
`DirTraversalResult::SuccessFiles { grouped_file_entries, warnings }` or `DirTraversalResult::Stopped`.

**Internals:**
- Rayon `into_par_iter().with_max_len(2)` for parallel folder processing.
- Two-phase: visit root dirs/files first, then recurse batch by batch.
- Applies extension, exclusion, and size filters during traversal.
- On Unix: optional filesystem-boundary checking (`exclude_other_filesystems`).
- Progress tracked via `ProgressThreadHandler` (dedicated thread, 200 ms interval).

---

## Progress Reporting (`src/common/progress_stop_handler.rs`)

`ProgressData` carries the current stage, the `CheckingMethod` (which disambiguates SameMusic from
Duplicate), stage indices, entries/bytes counters and the tool type.

`ProgressThreadHandler` (`src/common/progress_stop_handler.rs:15`) spawns a background thread that
polls `AtomicUsize`/`AtomicU64` counters and sends `ProgressData` to the frontend channel every ~200 ms.

Call `handler.increase_items(n)` / `handler.increase_size(n)` from rayon tasks
(using `Relaxed` ordering — fast, no synchronization overhead).

---

## Cancellation

Hot paths poll `check_if_stop_received(stop_flag)` and return `WorkContinueStatus::Stop` (or `break` /
`return None` inside rayon).

`stop_flag` is `Arc<AtomicBool>` with `Relaxed` ordering — sufficient for simple
"should I stop?" polling without synchronization cost. The frontend sets it to
`true`; the backend polls and stops gracefully.

---

## Cache (`src/common/cache.rs`)

`save_cache_to_file_generalized::<T>(…)` / `load_cache_from_file_generalized_by_path::<T>(…)` operate
on a `BTreeMap<String, T>` keyed by canonical path.

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

- Traversal: `folders.into_par_iter().with_max_len(2).map(…).while_some().collect()`.
- Deletion: `items.into_par_iter().map(…).while_some().flatten().collect()`, returning `None` on a
  received stop request for early exit.

Thread count is globally controlled via `set_number_of_threads(n)` (`src/common/mod.rs:58`), which
stores to a `LazyLock<Mutex<Option<usize>>>` and is applied via rayon's thread pool.

---

## ToolType Enum (`src/common/model.rs`)

`ToolType` variants: `Duplicate`, `EmptyFolders`, `EmptyFiles`, `InvalidSymlinks`, `BrokenFiles`,
`BadExtensions`, `BadNames`, `BigFile`, `SameMusic`, `SimilarImages`, `SimilarVideos`,
`TemporaryFiles`, `ExifRemover`, `VideoOptimizer`, plus `None` (`#[default]`).

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
