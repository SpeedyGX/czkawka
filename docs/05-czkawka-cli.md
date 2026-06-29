# czkawka_cli — Command-Line Interface

## Overview

[`czkawka_cli`](../czkawka_cli/) is a thin CLI wrapper around [`czkawka_core`](../czkawka_core/). It handles argument parsing, thread orchestration, progress rendering, and result output. All scanning logic lives in `czkawka_core`; this crate only wires it to the terminal.

**Source layout** ([`czkawka_cli/src/`](../czkawka_cli/src/)):

| File | Purpose |
|------|---------|
| [`main.rs`](../czkawka_cli/src/main.rs) | Entry point, thread spawning, 14 tool dispatcher functions |
| [`commands.rs`](../czkawka_cli/src/commands.rs) | All `clap` CLI argument definitions (~1329 lines) |
| [`progress.rs`](../czkawka_cli/src/progress.rs) | `indicatif` progress bar rendering |

---

## 1. Dependencies ([`Cargo.toml`](../czkawka_cli/Cargo.toml))

| Crate | Version | Purpose |
|-------|---------|---------|
| [`clap`](https://crates.io/crates/clap) | 4.5 | CLI argument parsing (derive API, colored help) |
| [`log`](https://crates.io/crates/log) | 0.4.22 | Logging facade |
| [`czkawka_core`](../czkawka_core/) | 11.0.1 (path) | All scanning and fix logic |
| [`indicatif`](https://crates.io/crates/indicatif) | 0.18 | Progress bar rendering |
| [`crossbeam-channel`](https://crates.io/crates/crossbeam-channel) | 0.5 | Unbounded channel for progress events |
| [`ctrlc`](https://crates.io/crates/ctrlc) | 3.4 | SIGINT / Ctrl+C handling (`termination` feature) |
| [`humansize`](https://crates.io/crates/humansize) | 2.1 | Human-readable byte-size formatting (`BINARY` units) |

### Optional features (forwarded to `czkawka_core`)

| Feature | Effect |
|---------|--------|
| `heif` | HEIF/HEIC image support (requires `libheif`) |
| `libraw` | RAW image support (requires `libraw`) |
| `libavif` | AVIF image support (requires `libavif`) |
| `xdg_portal_trash` | FlatPak-compatible trash via XDG portal |
| `no_colors` | Disables colored help output |

---

## 2. Execution Model ([`main.rs`](../czkawka_cli/src/main.rs))

```
main()
 ├─ register_image_decoding_hooks()
 ├─ Parse args (clap::Parser)
 ├─ set_config_cache_path("Czkawka", "Czkawka")
 ├─ setup_logger(true, "czkawka_cli", filtering_messages)
 ├─ Create crossbeam channel  (Sender<ProgressData>, Receiver<ProgressData>)
 ├─ Create Arc<AtomicBool> stop_flag
 ├─ spawn calculation_thread (DEFAULT_THREAD_SIZE stack)
 │    └─ dispatches to one of 14 tool functions based on Commands enum
 ├─ Register Ctrl+C handler → sets stop_flag = true (SeqCst)
 ├─ connect_progress(&progress_receiver)   [blocks main thread, renders progress bar]
 └─ join calculation_thread → print output → exit(11) if items found
```

**Key design points:**

- **Two threads**: The **main thread** renders progress via [`connect_progress()`](../czkawka_cli/src/progress.rs:9) (blocks on `progress_receiver.recv()`). The **calculation thread** runs the scan. When the sender is dropped (scan ends), `recv()` returns `Err`, exiting the loop.
- **Cancellation**: `Arc<AtomicBool>` (SeqCst ordering) is shared between the Ctrl+C handler and the calculation thread. Tools in `czkawka_core` poll it during scanning and stop gracefully.
- **Exit code**: `exit(11)` when items are found (unless `-W` is set), `exit(0)` otherwise — useful for scripting.

### Entry point signature ([`main.rs:52`](../czkawka_cli/src/main.rs:52))

```rust
fn main()
```

### The `CliOutput` struct ([`main.rs:46`](../czkawka_cli/src/main.rs:46))

```rust
pub struct CliOutput {
    pub found_any_files: bool,
    pub ignored_error_code_on_found: bool,
    pub output: String,
}
```

---

## 3. CLI Subcommands ([`commands.rs`](../czkawka_cli/src/commands.rs))

Defined via `clap` derive. Top-level enum [`Commands`](../czkawka_cli/src/commands.rs:38) has 14 variants:

| Subcommand | CLI Alias | Args Struct | Purpose | Core Tool |
|---|---|---|---|---|
| `Duplicates` | `dup` | [`DuplicatesArgs`](../czkawka_cli/src/commands.rs:118) | Find duplicate files | [`DuplicateFinder`](../czkawka_core/src/tools/duplicate/) |
| `EmptyFolders` | `empty-folders` | [`EmptyFoldersArgs`](../czkawka_cli/src/commands.rs:193) | Find empty directories | [`EmptyFolder`](../czkawka_core/src/tools/empty_folder/) |
| `BiggestFiles` | `big` | [`BiggestFilesArgs`](../czkawka_cli/src/commands.rs:201) | Find biggest/smallest files | [`BigFile`](../czkawka_core/src/tools/big_file/) |
| `EmptyFiles` | `empty-files` | [`EmptyFilesArgs`](../czkawka_cli/src/commands.rs:224) | Find zero-byte files | [`EmptyFiles`](../czkawka_core/src/tools/empty_files/) |
| `Temporary` | `temp` | [`TemporaryArgs`](../czkawka_cli/src/commands.rs:232) | Find temporary files | [`Temporary`](../czkawka_core/src/tools/temporary/) |
| `SimilarImages` | `image` | [`SimilarImagesArgs`](../czkawka_cli/src/commands.rs:250) | Find similar images | [`SimilarImages`](../czkawka_core/src/tools/similar_images/) |
| `SameMusic` | `music` | [`SameMusicArgs`](../czkawka_cli/src/commands.rs:320) | Find duplicate music | [`SameMusic`](../czkawka_core/src/tools/same_music/) |
| `InvalidSymlinks` | `symlinks` | [`InvalidSymlinksArgs`](../czkawka_cli/src/commands.rs:427) | Find broken symlinks | [`InvalidSymlinks`](../czkawka_core/src/tools/invalid_symlinks/) |
| `BrokenFiles` | `broken` | [`BrokenFilesArgs`](../czkawka_cli/src/commands.rs:435) | Find broken files | [`BrokenFiles`](../czkawka_core/src/tools/broken_files/) |
| `SimilarVideos` | `video` | [`SimilarVideosArgs`](../czkawka_cli/src/commands.rs:452) | Find similar videos | [`SimilarVideos`](../czkawka_core/src/tools/similar_videos/) |
| `BadExtensions` | `ext` | [`BadExtensionsArgs`](../czkawka_cli/src/commands.rs:520) | Find wrong file extensions | [`BadExtensions`](../czkawka_core/src/tools/bad_extensions/) |
| `BadNames` | `bad-names` | [`BadNamesArgs`](../czkawka_cli/src/commands.rs:533) | Find problematic names | [`BadNames`](../czkawka_core/src/tools/bad_names/) |
| `VideoOptimizer` | `video-optimizer` | [`VideoOptimizerArgs`](../czkawka_cli/src/commands.rs:585) | Transcode or crop videos | [`VideoOptimizer`](../czkawka_core/src/tools/video_optimizer/) |
| `ExifRemover` | `exif-remover` | [`ExifRemoverArgs`](../czkawka_cli/src/commands.rs:785) | Remove EXIF metadata | [`ExifRemover`](../czkawka_core/src/tools/exif_remover/) |

### 3.1 Shared struct: [`CommonCliItems`](../czkawka_cli/src/commands.rs:807)

Every subcommand flattens this struct:

| Flag | Long | Default | Description |
|------|------|---------|-------------|
| `-T` | `--thread-number` | `0` (all CPUs) | Thread count |
| `-d` | `--directories` | **(required)** | Directories to search |
| `-e` | `--excluded-directories` | `[]` | Excluded directories (absolute paths) |
| `-E` | `--excluded-items` | `[]` | Excluded items (glob patterns, e.g. `*/.*`) |
| `-x` | `--allowed-extensions` | `[]` | Allowed extensions (supports macros: `IMAGE`, `VIDEO`, `MUSIC`, `TEXT`) |
| `-P` | `--excluded-extensions` | `[]` | Excluded extensions |
| `-f` | `--file-to-save` | `None` | Save text results to file |
| `-C` | `--compact-json-file-to-save` | `None` | Save compact JSON to file |
| | `--pretty-json-file-to-save` | `None` | Save pretty JSON to file |
| `-R` | `--not-recursive` | `false` | Disable recursive scan |
| `-X` | `--exclude-other-filesystems` | `false` | (Unix only) Exclude other filesystems |
| `-N` | `--do-not-print-results` | `false` | Suppress results |
| `-M` | `--do-not-print-messages` | `false` | Suppress messages |
| `-W` | `--ignore-error-code-on-found` | `false` | Suppress non-zero exit code |
| `-H` | `--disable-cache` | `false` | Disable cache |

### 3.2 Delete methods

Two delete-method patterns are used across tools:

**`DMethod`** ([`commands.rs:905`](../czkawka_cli/src/commands.rs:905)) — For similarity-grouping tools (duplicates, images, music, videos):

| Flag | Long | Default | Description |
|------|------|---------|-------------|
| `-D` | `--delete-method` | `NONE` | `AEN`, `AEO`, `ON`, `OO`, `AEB`, `AES`, `OB`, `OS`, `HARD` |
| `-Q` | `--dry-run` | `false` | Preview without executing |
| `-y` | `--move-to-trash` | `false` | Use trash instead of permanent delete |

**`SDMethod`** ([`commands.rs:933`](../czkawka_cli/src/commands.rs:933)) — For simple tools (empty folders, big files, invalid symlinks, etc.):

| Flag | Long | Description |
|------|------|-------------|
| `-D` | `--delete` | Delete all found items |
| `-Q` | `--dry-run` | Preview without executing |
| `-y` | `--move-to-trash` | Use trash instead of permanent delete |

### 3.3 Subcommand-specific arguments

#### `DuplicatesArgs` ([`commands.rs:118`](../czkawka_cli/src/commands.rs:118))

| Flag | Long | Default | Description |
|------|------|---------|-------------|
| `-s` | `--search-method` | `HASH` | `NAME`, `SIZE`, `HASH` |
| `-t` | `--hash-type` | `BLAKE3` | `BLAKE3`, `CRC32`, `XXH3` |
| `-m` | `--minimal-file-size` | 8192 | Minimum file size in bytes |
| `-i` | `--maximal-file-size` | u64::MAX | Maximum file size in bytes |
| `-c` | `--minimal-cached-file-size` | 257144 | Minimum cached file size |
| `-Z` | `--minimal-prehash-cache-file-size` | 257144 | Minimum prehash cache file size |
| `-u` | `--use-prehash-cache` | false | Use prehash cache |
| `-l` | `--case-sensitive-name-comparison` | false | Case-sensitive name comparison |
| `-L` | `--allow-hard-links` | false | Don't ignore hard links |
| | `--reference-directories` | `[]` | Reference directories (not shown in results) |
| `-D` | (DMethod) | NONE | Delete method |

#### `SimilarImagesArgs` ([`commands.rs:250`](../czkawka_cli/src/commands.rs:250))

| Flag | Long | Default | Description |
|------|------|---------|-------------|
| `-s` | `--max-difference` | 5 | Max difference (0-40) |
| `-g` | `--hash-alg` | `Gradient` | Perceptual hash: `Mean`, `Gradient`, `Blockhash`, `VertGradient`, `DoubleGradient`, `Median` |
| `-z` | `--image-filter` | `Nearest` | Resize filter: `Lanczos3`, `Nearest`, `Triangle`, `Gaussian`, `CatmullRom` |
| `-c` | `--hash-size` | 16 | Hash size: 8, 16, 32, 64 |
| `-J` | `--ignore-same-size` | false | Ignore files with same size |
| `-Z` | `--ignore-same-resolution` | false | Ignore images with same resolution |
| `-m` | `--minimal-file-size` | 16384 | Minimum file size |
| `-i` | `--maximal-file-size` | u64::MAX | Maximum file size |

#### `SameMusicArgs` ([`commands.rs:320`](../czkawka_cli/src/commands.rs:320))

| Flag | Long | Default | Description |
|------|------|---------|-------------|
| `-z` | `--music-similarity` | `track_title,track_artist` | Tag fields to compare (comma-separated) |
| `-s` | `--search-method` | `TAGS` | `CONTENT` (audio fingerprint) or `TAGS` |
| | `--approximate-comparison` | false | Approximate tag comparison |
| | `--compare-fingerprints-only-with-similar-titles` | false | Only compare fingerprints for similar titles |
| `-l` | `--minimum-segment-duration` | 10.0 | Min audio segment (0-3600s) |
| `-Y` | `--maximum-difference` | 2.0 | Max audio difference (0-10) |
| `-m` | `--minimal-file-size` | 8192 | Minimum file size |
| `-i` | `--maximal-file-size` | u64::MAX | Maximum file size |

#### `BrokenFilesArgs` ([`commands.rs:435`](../czkawka_cli/src/commands.rs:435))

| Flag | Long | Default | Description |
|------|------|---------|-------------|
| `-t` | `--checked-types` | `PDF` | `PDF`, `AUDIO`, `IMAGE`, `ARCHIVE`, `VIDEO_FFPROBE`, `VIDEO_FFMPEG` (can be repeated) |

#### `SimilarVideosArgs` ([`commands.rs:452`](../czkawka_cli/src/commands.rs:452))

| Flag | Long | Default | Description |
|------|------|---------|-------------|
| `-t` | `--tolerance` | 10 | Max frame difference (0-20) |
| `-U` | `--skip-forward-amount` | 15 | Seconds to skip (0-300, predefined values) |
| `-B` | `--crop-detect` | `letterbox` | `none`, `letterbox`, `motion` |
| `-A` | `--scan-duration` | 10 | Scan duration in seconds |
| `-m` | `--minimal-file-size` | 8192 | Minimum file size |
| `-i` | `--maximal-file-size` | u64::MAX | Maximum file size |
| `-J` | `--ignore-same-size` | false | Ignore files with same size |

#### `VideoOptimizerArgs` ([`commands.rs:585`](../czkawka_cli/src/commands.rs:585))

Has two sub-subcommands:

**`transcode`** ([`TranscodeArgs`](../czkawka_cli/src/commands.rs:601)):

| Flag | Long | Default | Description |
|------|------|---------|-------------|
| `-c` | `--excluded-codecs` | `hevc,h265,av1,vp9` | Codecs to skip (comma-separated) |
| `-t` | `--generate-thumbnails` | false | Generate thumbnails |
| `-V` | `--thumbnail-percentage` | 10 | Thumbnail position (1-99%) |
| `-g` | `--thumbnail-grid` | false | Generate thumbnail grid |
| `-Z` | `--thumbnail-grid-tiles-per-side` | 3 | Grid tiles (2-6) |
| `-F` | `--fix-videos` | false | Actually transcode |
| | `--target-codec` | `h265` | `h264`, `h265`, `av1`, `vp9` |
| | `--quality` | 23 | Encoding quality (0-51) |
| | `--fail-if-not-smaller` | false | Fail if result isn't smaller |
| | `--overwrite-original` | false | Overwrite originals |
| | `--limit-video-size` | false | Limit video dimensions |
| | `--max-width` | 1920 | Max width |
| | `--max-height` | 1080 | Max height |
| | `--noise-reduction` | `none` | `none`, `hqdn3d` |
| | `--noise-reduction-strength` | 5 | Strength (1-10) |
| | `--custom-ffmpeg-command` | None | Custom ffmpeg args |

**`crop`** ([`CropArgs`](../czkawka_cli/src/commands.rs:696)):

| Flag | Long | Default | Description |
|------|------|---------|-------------|
| `-m` | `--crop-mechanism` | `blackbars` | `blackbars`, `staticcontent` |
| `-k` | `--black-pixel-threshold` | 32 | Threshold (0-128) |
| `-b` | `--black-bar-percentage` | 90 | Min black bar (50-100%) |
| `-s` | `--max-samples` | 20 | Frames to sample (5-1000) |
| `-z` | `--min-crop-size` | 10 | Min crop size (1-1000) |
| `-t` | `--generate-thumbnails` | false | Generate thumbnails |
| `-V` | `--thumbnail-percentage` | 10 | Position (1-99%) |
| `-g` | `--thumbnail-grid` | false | Grid of thumbnails |
| `-Z` | `--thumbnail-grid-tiles-per-side` | 3 | Grid tiles (2-6) |
| `-F` | `--fix-videos` | false | Actually crop |
| | `--overwrite-original` | false | Overwrite originals |
| | `--target-codec` | None | Also transcode |
| | `--quality` | None | Encoding quality |

#### `BadNamesArgs` ([`commands.rs:533`](../czkawka_cli/src/commands.rs:533))

| Flag | Long | Description |
|------|------|-------------|
| `-u` | `--uppercase-extension` | Check for uppercase extensions |
| `-j` | `--emoji-used` | Check for emoji in filenames |
| `-w` | `--space-at-start-or-end` | Check for leading/trailing spaces |
| `-n` | `--non-ascii-graphical` | Check for non-ASCII characters |
| `-r` | `--restricted-charset` | Allowed special characters |
| `-a` | `--remove-duplicated-non-alphanumeric` | Check for duplicated non-alphanumeric chars |
| `-F` | `--fix-names` | Auto-fix naming issues |

#### `ExifRemoverArgs` ([`commands.rs:785`](../czkawka_cli/src/commands.rs:785))

| Flag | Long | Description |
|------|------|-------------|
| `-i` | `--ignored-tags` | Comma-separated EXIF tags to keep |
| `-F` | `--fix-exif` | Actually remove EXIF tags |
| `-o` | `--override-file` | Override originals (no `_cleaned` suffix) |

#### `TemporaryArgs` ([`commands.rs:232`](../czkawka_cli/src/commands.rs:232))

| Flag | Long | Description |
|------|------|-------------|
| `-L` | `--extensions` | Custom temp file extensions (replaces defaults) |

---

## 4. Tool Dispatcher Pattern ([`main.rs`](../czkawka_cli/src/main.rs))

Every one of the 14 dispatch functions follows the same structure:

```rust
fn tool_name(args: ToolArgs, stop_flag: &Arc<AtomicBool>, progress_sender: &Sender<ProgressData>) -> CliOutput {
    // 1. Destructure args
    // 2. Build tool-specific parameter struct
    let mut tool = ToolType::new(params);
    // 3. Apply common settings (paths, extensions, cache, threads)
    set_common_settings(&mut tool, &common_cli_items, reference_directories);
    // 4. Apply tool-specific settings (file sizes, delete method, etc.)
    // 5. Run scan
    tool.search(stop_flag, Some(progress_sender));
    // 6. Optionally run fix (rename/delete/transcode/etc.)
    // 7. Collect and return output
    save_and_write_results_to_writer(&tool, &common_cli_items)
}
```

### [`set_common_settings`](../czkawka_cli/src/main.rs:640)

Applies to all tools via the [`AllTraits`](../czkawka_core/src/common/traits.rs) trait bound:

1. Sets thread count via `set_number_of_threads()`
2. Merges `--directories` with `--reference-directories` into `included_paths`
3. Sets reference paths (for tools that support it)
4. Sets excluded paths, excluded items (glob), recursive flag
5. (Unix only) Sets `exclude_other_filesystems`
6. Sets allowed and excluded extensions
7. Enables/disables cache

### Output collection ([`save_and_write_results_to_writer`](../czkawka_cli/src/main.rs:575))

1. Optionally writes results to a text file via `PrintResults::print_results_to_file`
2. Optionally writes compact JSON via `PrintResults::save_results_to_file_as_json(file, false)`
3. Optionally writes pretty JSON via `PrintResults::save_results_to_file_as_json(file, true)`
4. Buffers stdout output (results + messages) unless suppressed by `-N`/`-M`
5. Returns [`CliOutput`](../czkawka_cli/src/main.rs:46) with `found_any_files`, `ignored_error_code_on_found`, and the buffered output string

### Tools with fix operations

Some tools have an optional "fix" step after scanning:

| Tool | Fix flag | Effect |
|------|----------|--------|
| `BadExtensions` | `-F` | Renames files to correct extensions |
| `BadNames` | `-F` | Renames files to fix naming issues |
| `VideoOptimizer` (transcode) | `-F` | Transcodes videos |
| `VideoOptimizer` (crop) | `-F` | Crops videos |
| `ExifRemover` | `-F` | Removes EXIF tags |

---

## 5. Progress Rendering ([`progress.rs`](../czkawka_cli/src/progress.rs))

[`connect_progress()`](../czkawka_cli/src/progress.rs:9) runs on the main thread, blocking on `progress_receiver.recv()`:

```rust
pub(crate) fn connect_progress(progress_receiver: &Receiver<ProgressData>)
```

### Progress bar types

| Stage | Bar Type | Template |
|-------|----------|----------|
| Collecting files/folders | Spinner | `{msg} {spinner:.blue}` |
| Loading/saving cache | Spinner | `"Loading cache {spinner}"` / `"Saving cache {spinner}"` |
| Known total entries/bytes | Linear bar | `{msg} [{bar}]` with `"=> "` progress chars |

### Stage labels

The message text is derived from [`CurrentStage`](../czkawka_core/src/common/progress_data.rs) via [`get_progress_message()`](../czkawka_cli/src/progress.rs:57):

| Stage | Label |
|-------|-------|
| `CollectingFiles` | `"Collecting files: N"` or `"Collecting folders: N"` |
| `SameMusicReadingTags` | `"Reading tags"` |
| `SameMusicCalculatingFingerprints` | `"Calculating fingerprints"` |
| `SameMusicComparingTags` | `"Comparing tags"` |
| `SameMusicComparingFingerprints` | `"Comparing fingerprints"` |
| `DuplicatePreHashing` | `"Calculating prehashes"` |
| `DuplicateFullHashing` | `"Calculating hashes"` |
| `SimilarImagesCalculatingHashes` | `"Calculating image hashes"` |
| `SimilarImagesComparingHashes` | `"Comparing image hashes"` |
| `SimilarVideosCalculatingHashes` | `"Reading similar values"` |
| `SimilarVideosCreatingThumbnails` | `"Creating video thumbnails"` |
| `BrokenFilesChecking` | `"Checking broken files"` |
| `BadExtensionsChecking` | `"Checking extensions of files"` |
| `DeletingFiles` | `"Deleting files/folders"` |
| `RenamingFiles` | `"Renaming files"` |
| `MovingFiles` | `"Moving files"` |
| `HardlinkingFiles` | `"Creating hardlinks"` |
| `SymlinkingFiles` | `"Creating symlinks"` |
| `OptimizingVideos` | `"Optimizing videos"` |
| `CleaningExif` | `"Cleaning EXIF data"` |
| `ExifRemoverExtractingTags` | `"Extracting EXIF tags"` |
| `VideoOptimizerProcessingVideos` | `"Processing videos"` |
| `BadNamesChecking` | `"Checking names of files"` |
| `*HidingHardLinks` | `"Hiding duplicates with hardlinks"` |
| `VideoOptimizerCreatingThumbnails` | `"Creating video thumbnails"` |

### Progress bar re-creation

The progress bar is re-created only when `current_stage_idx` changes (detected by comparing `latest_id`). Four different progress bar constructors exist:

- [`get_progress_bar_for_collect_files()`](../czkawka_cli/src/progress.rs:101) — spinner, tick strings using Unicode triangles
- [`get_progress_known_values(max_value)`](../czkawka_cli/src/progress.rs:113) — linear bar, template `{msg} [{bar}]`
- [`get_progress_loading_saving_cache(loading)`](../czkawka_cli/src/progress.rs:123) — spinner with "Loading cache" or "Saving cache" text

For known-value progress, the message shows:

- **Bytes mode** (when `bytes_to_check != 0`): `"label: ent_checked/ent_total (bytes_checked/bytes_total)"`
- **Entry mode** (otherwise): `"label: entries_checked/entries_total"`

Byte sizes are formatted with [`humansize`](https://crates.io/crates/humansize) using `BINARY` units (KiB, MiB, etc.).

---

## 6. Parsers and Validators ([`commands.rs`](../czkawka_cli/src/commands.rs))

The file contains multiple custom `value_parser` functions for clap:

| Function | Location | Purpose |
|----------|----------|---------|
| `parse_minimal_file_size` | Line 1198 | Validates size > 0 |
| `parse_maximal_file_size` | Line 1211 | Parses u64 size |
| `parse_checking_method_duplicate` | Line 1126 | `NAME`, `SIZE`, `SIZE_NAME`, `HASH` |
| `parse_hash_type` | Line 1104 | `BLAKE3`, `CRC32`, `XXH3` |
| `parse_similar_hash_algorithm` | Line 1230 | `Mean`, `Gradient`, `Blockhash`, `VertGradient`, `DoubleGradient`, `Median` |
| `parse_similar_image_filter` | Line 1218 | `Lanczos3`, `Nearest`, `Triangle`, `Gaussian`, `CatmullRom` |
| `parse_image_hash_size` | Line 1243 | 8, 16, 32, 64 |
| `parse_delete_method` | Line 1182 | `NONE`, `AEN`, `AEO`, `ON`, `OO`, `HARD`, `AEB`, `AES`, `OB`, `OS` |
| `parse_checking_method_same_music` | Line 1148 | `TAGS`, `CONTENT` |
| `parse_music_duplicate_type` | Line 1254 | Comma-separated tag fields |
| `parse_broken_files` | Line 1136 | `PDF`, `AUDIO`, `IMAGE`, `ARCHIVE`, `VIDEO_FFPROBE`, `VIDEO_FFMPEG` |
| `parse_tolerance` | Line 1113 | Range 0-20 for video similarity |
| `parse_skip_forward_amount` | Line 1092 | Must be in `ALLOWED_SKIP_FORWARD_AMOUNT` |
| `parse_scan_duration` | Line 1072 | Must be in `ALLOWED_VID_HASH_DURATION` |
| `parse_crop_detect` | Line 1085 | `none`, `letterbox`, `motion` |
| `parse_video_codec` | Line 1156 | `h264`, `h265`/`hevc`, `av1`, `vp9` |
| `parse_max_samples` | Line 1166 | Range 5-1000 |
| `parse_min_crop_size` | Line 1174 | Range 1-1000 |
| `parse_crop_mechanism` | Line 1289 | `blackbars`, `staticcontent` |
| `parse_noise_reduction` | Line 1296 | Delegates to `NoiseReductionMethod::parse` |
| `parse_maximum_difference` | Line 398 | Range 0-10 for audio |
| `parse_minimum_segment_duration` | Line 412 | Range 0-3600 for audio |

---

## 7. Help Template ([`commands.rs:1300`](../czkawka_cli/src/commands.rs:1300))

The `HELP_TEMPLATE` constant provides a custom help layout showing usage, options, commands with aliases, and 14 example invocations. Colored styling is applied via [`CLAP_STYLING`](../czkawka_cli/src/commands.rs:17) unless the `no_colors` feature is enabled.

---

## 8. Optional Features

| Feature | Effect |
|---------|--------|
| `heif` | Enables HEIF/HEIC image support in `czkawka_core` |
| `libraw` | Enables RAW camera image support in `czkawka_core` |
| `libavif` | Enables AVIF image support in `czkawka_core` |
| `xdg_portal_trash` | Uses XDG portal for trash (Flatpak compatibility) |
| `no_colors` | Disables colored clap help output |

---

## 9. Summary

`czkawka_cli` is a well-structured, minimal CLI frontend that:

1. **Parses arguments** via `clap` derive API with extensive validation
2. **Spawns a dedicated thread** for scanning with a shared stop flag for cancellation
3. **Renders progress** on the main thread via `indicatif` with spinner and linear bars adapted to the scanning stage
4. **Dispatches to 14 different tools** in `czkawka_core`, each following the same pattern
5. **Supports three output formats** (text, compact JSON, pretty JSON) plus optional file saving
6. **Supports delete/fix operations** with dry-run and trash options
7. **Returns exit code 11** when items are found (configurable with `-W`) for scripting
