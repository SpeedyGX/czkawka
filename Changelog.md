## Version ? - ??.??.????r 

### Performance – Core (`czkawka_core`)
- Optimized `hash_images` in Similar Images tool – errors are now logged directly instead of being collected into a `Vec<String>`, reducing memory allocation during large scans
- Dynamic chunking in BK-tree hash comparison – chunk size adapts to data volume (`max(500, n / (cpus*4))`) instead of a fixed 1000, improving throughput for both small and large image sets
- Merged two separate filter chains in `compare_hashes_with_non_zero_tolerance` into a single filter, eliminating a stale TODO comment and reducing iterator overhead

### Performance – Shared state
- Changed `SharedModels` from `Arc<Mutex<...>>` to `Arc<RwLock<...>>` – concurrent readers no longer block each other; writes are exclusive but rare (only when saving scan results into the model)

### UI/UX – Krokiet
- **Filter active indicator** – a coloured accent strip now appears to the left of the search bar whenever a filter is applied, making active filtering state visible at a glance
- **Preview panel close button** – added a title bar with a "✕" button to the preview panel, allowing users to dismiss it without dragging the splitter
- **Fixed keyboard navigation** – merged `key-released` and `key-pressed` handlers into a single `key-pressed` handler, resolving a long-standing issue where keyboard events would not fire after the first click (Slint #3503)

### Architecture – Krokiet
- **ActiveTab lookup table** – replaced six large `match` blocks (get_str_path_idx, get_str_name_idx, get_int_modification_date_idx, get_int_size_opt_idx, get_is_header_mode) with a const lookup array `TAB_META` in the new `active_tab_meta.rs` module. Adding a new tool now requires only touching the array instead of touching six separate functions
- **Filter cache eviction** – `FILTER_CACHE` now holds at most 2 recently used tabs (LRU eviction) instead of unbounded growth, preventing memory leaks when switching between many tools
- **Scoped lint suppression** – `#![allow(clippy::unwrap_used, clippy::indexing_slicing)]` restricted to the generated Slint module only, no longer masking warnings in hand-written code

### Build
- Added `release-lto` Cargo profile with `lto = "fat"`, `codegen-units = 1` and `strip = "symbols"` for producing smaller, faster production binaries – run with `cargo build --profile release-lto --bin krokiet`

### Core
- Switched AV1 encoding from the very slow `libaom-av1` to `libsvtav1` - [#1888](https://github.com/qarmin/czkawka/pull/1888)  
- Added a noise reduction option to Video Optimizer mode, which can significantly reduce file size for noisy videos - [#1888](https://github.com/qarmin/czkawka/pull/1888)  
- Added support for custom optimization commands in Video Optimizer mode - [#1888](https://github.com/qarmin/czkawka/pull/1888)  
- Added experimental hardware-accelerated video encoding - [#1900](https://github.com/qarmin/czkawka/pull/1900)  
- Broken files now allows to check file with multiple different checkers - [#1900](https://github.com/qarmin/czkawka/pull/1900)  
- Checking for broken videos was split into fast(ffprobe - only headers) and slow(ffmpeg - full decoding) checks - [#1900](https://github.com/qarmin/czkawka/pull/1900)  
- Added ability to stop ignoring hardlinks search and added progress tracking for this operation - [#1900](https://github.com/qarmin/czkawka/pull/1900)  
- Added ability to exclude images/videos with the same resolution - [#1900](https://github.com/qarmin/czkawka/pull/1900)  

### CLI

### GTK GUI
- Fixed a crash when using the sort button - [#1837](https://github.com/qarmin/czkawka/pull/1837)  

### Krokiet
- Added separate buttons for moving files to trash and permanently deleting them - [#1900](https://github.com/qarmin/czkawka/pull/1900)  
- Added a new custom selection popup - [#1809](https://github.com/qarmin/czkawka/pull/1809)  
- Added an image comparison tool to detect visual differences between similar images - [#1888](https://github.com/qarmin/czkawka/pull/1888)  
- Added a context menu (right-click) - [#1888](https://github.com/qarmin/czkawka/pull/1888)  
- File/folder selection dialogs no longer block the main thread - [#1809](https://github.com/qarmin/czkawka/pull/1809)  
- Fixed an issue where thumbnail generation settings were not respected in Similar Videos mode - [#1809](https://github.com/qarmin/czkawka/pull/1809)  
- Added notification support - [#1837](https://github.com/qarmin/czkawka/pull/1837)  
- Femtovg backend no longer have blurry fonts - [#1900](https://github.com/qarmin/czkawka/pull/1900)  
- Changed default select buttons from "select one item" to "select all except one item" - [#1913](https://github.com/qarmin/czkawka/pull/1913)
- Added ability to choose which select buttons are visible in UI - [#1913](https://github.com/qarmin/czkawka/pull/1913)

### Cedinia
- Initial experimental release of Cedinia, a new Android app with touch support - [#1821](https://github.com/qarmin/czkawka/pull/1821)  

### Prebuilt binaries
- Linux prebuilt binaries now include AVIF support (requires `libavif` and `libdav1d` installed on the system)  
- Windows ZIP package now includes Krokiet binaries and a README to simplify migration to the new frontend
- All backends Krokiet binaries on all systems, are now packed into zip files, with additional scripts to open them with selected backend
- Mac Intel binaries are no longer provided, due very long build times on GitHub CI

## Version 11.0.1 - 20.02.2026r
### Core
- Fixed issue with excluded folders not working on Windows - [#1808](https://github.com/qarmin/czkawka/pull/1808)
