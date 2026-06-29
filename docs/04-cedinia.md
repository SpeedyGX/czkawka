# cedinia — The Android/Mobile Slint GUI for Czkawka

**Version:** 11.0.1  
**License:** GPL-3.0-only  
**Min Rust:** 1.92.0, edition 2024  
**Crate type:** `cdylib` (Android) + `rlib` (desktop)  
**Description:** Android touch-friendly GUI for Czkawka Core, named after the Battle of Cedynia (972 AD)

---

## Table of Contents

1. [Overview](#overview)
2. [Dependencies (`Cargo.toml`)](#dependencies-cargotoml)
3. [Build Script (`build.rs`)](#build-script-buildrs)
4. [Entry Points](#entry-points)
5. [Source Modules](#source-modules)
6. [Slint UI Structure](#slint-ui-structure)
7. [Android Integration](#android-integration)
8. [Internationalization (i18n)](#internationalization-i18n)
9. [Icons](#icons)
10. [Key Differences from Krokiet](#key-differences-from-krokiet)

---

## Overview

Cedinia is the **mobile-first** Slint GUI for the Czkawka project. Its primary target is **Android** (via `cdylib` + `android-activity`), but it also runs as a **desktop application** using the winit/femtovg backend. The codebase mirrors krokiet's architecture but is adapted for touch interaction and mobile constraints.

**Directory structure (`cedinia/`):**

```
cedinia/
├── Cargo.toml              # Dependencies, Android metadata
├── build.rs                # Slint compilation + Android DEX assembly
├── i18n.toml               # Fluent i18n configuration
├── README.md               # Project description
├── TMP_INSTALL.md          # Build instructions
├── THIRD_PARTY_LICENSES.txt
├── android/                # Gradle build files
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   └── app/
│       └── src/main/AndroidManifest.xml
├── icons/                  # SVG icons for navigation and branding
│   ├── cedinia_duplicate.svg
│   ├── cedinia_folder.svg
│   ├── cedinia_folder_empty.svg
│   ├── cedinia_home.svg
│   ├── cedinia_image.svg
│   ├── cedinia_logo.svg
│   ├── cedinia_logo_horizontal.png
│   ├── cedinia_logo_horizontal.svg
│   └── cedinia_more.svg
├── java/                   # Java/Kotlin helpers for Android
│   ├── CediniaActivity.java
│   ├── CediniaFilePicker.java
│   └── CediniaPickerFragment.java
├── res/                    # Android resources (launcher icons, strings)
│   ├── drawable/
│   ├── drawable-nodpi/
│   ├── mipmap-*/ic_launcher.png
│   └── values/strings.xml
├── i18n/                   # Fluent translation files (28 languages)
│   ├── en/cedinia.ftl
│   ├── pl/cedinia.ftl
│   └── ... (26 more)
├── src/                    # Rust source
│   ├── lib.rs              # Library root, android_main entry point
│   ├── bin/cedinia.rs      # Desktop binary entry point
│   ├── app.rs              # run_app(), main window setup, GuiHandler
│   ├── localizer_cedinia.rs # flc! macro, language configuration
│   ├── common.rs           # String/int column index constants
│   ├── model.rs            # FileEntry model conversion, toggle_row, count_checked
│   ├── callbacks.rs        # Re-exports for callback wiring submodules
│   ├── callbacks/
│   │   ├── directories.rs  # Directory picker, volumes, path edit, dirs check
│   │   ├── misc.rs         # Open path, permissions, collect test, cache, language
│   │   ├── scan.rs         # Scan request building, stop, tool change
│   │   └── selection.rs    # Select/deselect, delete, rename, clean EXIF
│   ├── compare.rs          # Image compare (side-by-side, split, overlay, diff)
│   ├── file_picker_android.rs # JNI bridge to Java file picker
│   ├── scan_runner.rs      # Worker thread, ScanRequest/ScanResult types
│   ├── scanners.rs         # Thin wrappers calling czkawka_core tools
│   ├── settings/
│   │   ├── mod.rs          # Settings load/save, apply/collect
│   │   └── gui_settings_values.rs # Combo box item definitions
│   ├── set_initial_gui_infos.rs # Validates Slint/Rust combo box sync
│   ├── thumbnail_loader.rs # Background thumbnail generation + disk cache
│   ├── translations.rs     # Sets all Translate global properties
│   ├── notifications.rs    # System notifications (Android + Linux/desktop)
│   └── volumes.rs          # Storage volume detection, home_dir
└── ui/                     # Slint UI files
    ├── main_window.slint   # Root window, screen routing
    ├── app_state.slint     # All Slint global singletons
    ├── colors.slint        # Color palette (dark/light theme)
    ├── common.slint        # Enums, structs
    ├── components.slint    # Reusable UI components
    ├── translations.slint  # All translatable strings (defaults in English)
    ├── home_screen.slint   # Tool card grid
    ├── results_list.slint  # Results list view
    ├── scan_progress.slint # Progress bar
    ├── settings_screen.slint     # Settings with tabs
    ├── settings_components.slint # Toggle, segment, dropdown, text input rows
    ├── directories_screen.slint  # Directory management
    ├── bottom_nav.slint    # 4-tab bottom navigation bar
    ├── top_bar.slint       # App bar with title and status
    ├── similar_images_gallery.slint # Gallery view
    └── image_compare.slint # Image comparison overlay
```

---

## Dependencies (`Cargo.toml`)

### Common dependencies (all platforms)

| Crate | Version | Purpose |
|-------|---------|---------|
| `czkawka_core` | 11.0.1 | Scanning engine (path) |
| `crossbeam-channel` | 0.5 | Channel-based worker communication |
| `log` | 0.4 | Logging facade |
| `humansize` | 2.1 | Human-readable file sizes |
| `filetime` | 0.2 | File timestamp manipulation |
| `serde` + `serde_json` | 1.0 | Settings serialization |
| `image` | 0.25 | Thumbnail loading and diff computation |
| `i18n-embed` | 0.16 | Fluent translation loading |
| `i18n-embed-fl` | 0.10 | Fluent macro support |
| `rust-embed` | 8.5 | Embedding translation files at compile time |

### Android-specific dependencies (`cfg(target_os = "android")`)

| Crate | Version | Purpose |
|-------|---------|---------|
| `slint` | 1.15.0 | UI framework (`backend-android-activity-06`) |
| `android-activity` | 0.6 | Android `NativeActivity` integration |
| `jni` | 0.22.1 | JNI bindings for file picker, notifications |
| `android_logger` | 0.15.1 | Routes `log` to Android logcat |

### Desktop-specific dependencies (`cfg(not(target_os = "android"))`)

| Crate | Version | Purpose |
|-------|---------|---------|
| `slint` | 1.15.0 | UI framework (`backend-winit`, `renderer-winit-femtovg`, software) |
| `rfd` | 0.17 | Native file dialog (xdg-portal) |
| `trash` | 5.2.5 | Send deleted files to recycle bin |
| `notify-rust` | 4 | Desktop notifications |

### Build dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| `slint-build` | 1.15 | Compiles `.slint` to Rust at build time |
| `android-build` | 0.1.2 | Compiles Java sources to DEX for Android |

### Renderer features (optional)

| Feature | Slint renderer |
|---------|----------------|
| `skia_opengl` | Skia OpenGL |
| `skia_vulkan` | Skia Vulkan |
| `software` | Software renderer |
| `femtovg` | NanoVG via femtovg |

---

## Build Script (`build.rs`)

The file at [`cedinia/build.rs`](cedinia/build.rs) does two things:

1. **Compile Slint UI:** Calls [`slint_build::compile_with_config()`](cedinia/build.rs:5) on `ui/main_window.slint` using the Material style.

2. **Android DEX assembly** (only when `TARGET` contains `"android"`):
   - Uses [`android_build`](cedinia/build.rs:16) to compile Java sources in `java/` to `.class` files with `javac`.
   - Converts `.class` files to a `classes.dex` using D8 (Android's Dalvik/ART bytecode converter).
   - The resulting DEX is embedded via `include_bytes!` at runtime and loaded with `InMemoryDexClassLoader`.

---

## Entry Points

### Android: `android_main` in [`src/lib.rs`](cedinia/src/lib.rs:64)

```rust
#[cfg(target_os = "android")]
#[unsafe(no_mangle)]
fn android_main(android_app: slint::android::AndroidApp)
```

Called by the Android system when the native activity starts. Steps:
1. Initializes `android_logger` for logcat output.
2. Calls `setup_android_paths()` to retrieve `getFilesDir()` and `getCacheDir()` via JNI — stores them in `OnceLock` statics.
3. Computes display scale from Android config density.
4. Initializes the file picker JNI bridge (`file_picker_android::init`).
5. Initializes the Slint Android backend.
6. Sets up the navigation bar (`file_picker_android::setup_nav_bar`).
7. Computes `inset_bottom_px` from the content rectangle for edge-to-edge layout.
8. Calls `app::run_app_with_insets()`.

### Desktop: `run_app` in [`src/app.rs`](cedinia/src/app.rs:58)

The binary entry point at [`src/bin/cedinia.rs`](cedinia/src/bin/cedinia.rs:1) simply calls `cedinia::run_app()`. On desktop, this calls `run_app_with_insets(0.0, 1.0, ())`.

### `run_app_inner` (`src/app.rs:340`)

The shared initialization logic:
1. Spawns thumbnail cleanup thread.
2. Creates the `MainWindow` Slint component.
3. Loads settings, applies language preference, translates UI.
4. Calls `set_initial_gui_infos` for validation.
5. Sets up the scanning worker thread via `start_worker()`.
6. Wires all callbacks (`wire_scan`, `wire_permission`, `wire_selection`, `wire_directories`, etc.).
7. Starts a polling timer (50ms) for thumbnail results and delete events.
8. On Android, polls storage permission and notification state every 2 seconds.
9. Runs the Slint event loop.

---

## Source Modules

### [`src/lib.rs`](cedinia/src/lib.rs) — Library root

Declares all modules, includes the generated Slint code via `slint::include_modules!()`, and holds the `android_main` entry point. Exposes `run_app` publicly. Also provides `android_files_path()` and `android_cache_path()` accessors.

### [`src/common.rs`](cedinia/src/common.rs) — Column index constants

Defines the column indices used in `FileEntry.val_str` and `FileEntry.val_int`:

| Constant | Index | Purpose |
|----------|-------|---------|
| `STR_IDX_NAME` | 0 | File name |
| `STR_IDX_PATH` | 1 | File path |
| `STR_IDX_SIZE` | 2 | Human-readable size |
| `STR_IDX_MODIFIED` | 3 | Human-readable date |

Plus tool-specific extra columns via enums:
- [`StrDataSimilarImages`](cedinia/src/common.rs:15): `DimsDisplay` (string, e.g. "1920×1080 Δ42")
- [`IntDataSimilarImages`](cedinia/src/common.rs:22): `Width`, `Height`, `Diff`
- [`StrDataBrokenFiles`](cedinia/src/common.rs:31): `ErrorString`
- [`StrDataBadExtensions`](cedinia/src/common.rs:38): `Display`, `ProperExtension`
- [`StrDataSameMusic`](cedinia/src/common.rs:46): `Display` (Artist - Title), `Title`
- [`StrDataBadNames`](cedinia/src/common.rs:54): `NewName`
- [`IntDataExifRemover`](cedinia/src/common.rs:61): `ExifTagCount`

### [`src/app.rs`](cedinia/src/app.rs) — Application setup

Key items:
- [`GuiHandler`](cedinia/src/app.rs:187): Implements `ScanResultHandler` to receive scan results and forward them to the event loop.
- [`build_gallery_groups()`](cedinia/src/app.rs:77): Converts flat `FileItem` list into `SimilarGroupCard` for the gallery view.
- [`rebuild_similar_images_after_delete()`](cedinia/src/app.rs:129): Rebuilds gallery models after items are deleted.
- [`show_delete_errors()`](cedinia/src/app.rs:120): Displays delete errors (up to 10, plus "and N more").
- On Android, stores directory state in a `thread_local!` for the Java file picker callback ([`on_directory_picked()`](cedinia/src/app.rs:36)).

### [`src/localizer_cedinia.rs`](cedinia/src/localizer_cedinia.rs) — `flc!` macro

```rust
#[macro_export]
macro_rules! flc {
    ( $($tt:tt)* ) => {{
        i18n_embed_fl::fl!($crate::localizer_cedinia::LANGUAGE_LOADER_CEDINIA, $($tt)*)
    }};
}
```

The `flc!` macro resolves keys from the Fluent translation system. It supports patterns like:
- `flc!("key")` — simple lookup
- `flc!("key", count = file_count)` — with interpolation variables

Also provides:
- [`LANGUAGE_LIST`](cedinia/src/localizer_cedinia.rs:26): 28 supported languages with display names.
- [`detect_os_language_idx()`](cedinia/src/localizer_cedinia.rs:56): Detects OS language on desktop via `DesktopLanguageRequester`.
- [`apply_language_preference()`](cedinia/src/localizer_cedinia.rs:72): Selects a language from the loaded Fluent bundle.

### [`src/callbacks/`](cedinia/src/callbacks/) — Callback wiring

| File | Key Functions | Purpose |
|------|---------------|---------|
| [`scan.rs`](cedinia/src/callbacks/scan.rs) | `wire_scan()` | Start/stop scan, tool change, build `ScanRequest` from GUI state. Handles all 11 tool types + Home/Directories/Settings. |
| [`directories.rs`](cedinia/src/callbacks/directories.rs) | `wire_directories()` | Include/exclude dir management, volume listing, path edit popup, directory statistics ("Analyze" button). |
| [`selection.rs`](cedinia/src/callbacks/selection.rs) | `wire_selection()` | Select/deselect all, by size, by resolution, invert. Delete/rename/clean EXIF execution in background thread. Gallery delete with stop support. |
| [`misc.rs`](cedinia/src/callbacks/misc.rs) | Various `wire_*` | Open path/folder, permissions, collect test, cache info, language change, notifications, URL opening, settings saving, licenses. |

### [`src/compare.rs`](cedinia/src/compare.rs) — Image comparison

Full-featured image comparison with generation-based cancellation:

| Mode | Behavior |
|------|----------|
| Normal | Side-by-side, each image at `ImageFit.contain` |
| Split | Left/right images clipped at slider position |
| Overlay | Left image with right image superimposed at `opacity = slider` |
| Diff | Per-pixel squared-difference computed as greyscale image |

Uses thread-local generation counters (`DIFF_GEN`, `SET_LEFT_GEN`, `SET_RIGHT_GEN`, `OPEN_GEN`) to discard stale image loads when the user navigates between groups or changes images.

### [`src/file_picker_android.rs`](cedinia/src/file_picker_android.rs) — JNI bridge

The central piece of Android integration. Key functions:

| Function | Purpose |
|----------|---------|
| `init()` | Loads the compiled `classes.dex` via `InMemoryDexClassLoader`, registers native JNI method `onDirectoryPicked`. |
| `launch_pick_directory()` | Calls Java `CediniaFilePicker.pickIncludeDirectory()` or `pickExcludeDirectory()`. |
| `check_storage_permission()` | Queries Java `hasStoragePermission()`. |
| `request_storage_permission()` | Requests `MANAGE_EXTERNAL_STORAGE` (Android 11+) or `READ_EXTERNAL_STORAGE` (Android 6-10). |
| `setup_nav_bar()` | Sets up system bar behavior for swipe-to-reveal navigation. |
| `open_url()` / `open_file()` / `open_folder()` | Platform-specific file/URL opening via JNI. |
| `try_jvm()` | Safe wrapper around `JavaVM::from_raw()` that returns `None` when the VM pointer is null (app paused). |

Static globals (`APP_HANDLE`, `DEX_LOADER_REF`, `ACTIVITY_GLOBAL_REF`) are guarded by `Mutex<Option<...>>` so they can be updated on Activity recreation.

### [`src/scan_runner.rs`](cedinia/src/scan_runner.rs) — Worker thread

Defines:
- [`ScanRequest`](cedinia/src/scan_runner.rs:66): Enum with all tool-specific scan parameters + `Stop`.
- [`ScanResult`](cedinia/src/scan_runner.rs:144): Enum with result variants for each tool + `Progress` + `Finished`.
- [`ScanResultHandler`](cedinia/src/scan_runner.rs:160): Trait for receiving results.
- [`start_worker()`](cedinia/src/scan_runner.rs:164): Spawns a dedicated scanner thread.
- [`apply_filters()`](cedinia/src/scan_runner.rs:377): Applies `CommonFilters` to any tool implementing `CommonData`.
- [`spawn_progress_forwarder()`](cedinia/src/scan_runner.rs:404): Bridges `czkawka_core::ProgressData` to `ScanResult::Progress`.
- [`fmt_date()`](cedinia/src/scan_runner.rs:426): Custom date formatter (avoids chrono dependency).

### [`src/scanners.rs`](cedinia/src/scanners.rs) — Tool wrappers

Thin wrappers that call `czkawka_core` tools and convert results to `FileItem` vectors. Each follows the same pattern:

1. Create tool parameters and the tool struct.
2. Set included paths and apply common filters.
3. Call `tool.search(stop, Some(&ptx))` with a progress forwarder.
4. Process results: group by reference/non-reference, sort by total size, convert to `FileItem`.

Supported tools:
- `scan_duplicate_files` (Hash/Name/Size/SizeName checking)
- `scan_empty_folders`
- `scan_similar_images` (with similarity preset, hash size/alg, filter)
- `scan_empty_files`
- `scan_temporary_files`
- `scan_big_files` (biggest/smallest)
- `scan_broken_files` (audio/PDF/archive/image)
- `scan_bad_extensions`
- `scan_same_music` (tag comparison + fingerprint)
- `scan_bad_names` (uppercase ext, emoji, spaces, non-ASCII, duplicates)
- `scan_exif_remover`

### [`src/thumbnail_loader.rs`](cedinia/src/thumbnail_loader.rs)

Background thumbnail generation with:
- **Disk cache** in `~/.cache/cedinia/img_thumbnails/` (Linux) or Android cache dir.
- **Cache invalidation** by file path + mtime + size hash.
- **RAM budget**: Scales from 256 MB to 4 GB based on total system RAM.
- **Parallel workers**: Up to 4 concurrent thumbnail generators.
- **30-day cleanup**: Old thumbnails are removed on startup.
- **Placeholder image**: Checkerboard pattern (32×32) while loading.

### [`src/notifications.rs`](cedinia/src/notifications.rs)

Dual-platform notification system:
- **Android**: Builds `Notification` via JNI with proper channel setup, icon resolution, and `PendingIntent` to bring the app to foreground.
- **Desktop Linux**: Tries `notify-send` first, falls back to `notify-rust`.
- **Foreground detection** (Android): Checks `RunningAppProcessInfo.importance == 100` via JNI.

### [`src/volumes.rs`](cedinia/src/volumes.rs)

- `home_dir()`: Returns `/sdcard` on Android, `$HOME` on desktop.
- `detect_storage_volumes()`: Reads `/proc/mounts` for vfat/exfat/ntfs/sdcardfs/fuse mountpoints. On Android, also checks known candidate paths.
- `classify_mountpoint()`: Labels as "Internal storage", "SD card", or "Storage".

### [`src/settings/mod.rs`](cedinia/src/settings/mod.rs) — Settings management

- [`CediniaSettings`](cedinia/src/settings/mod.rs:62): Serde-deserializable struct with ~40 fields covering all tool settings.
- Loads/saves to `cedinia_settings.json` and `cedinia_dirs.json` in the config folder.
- `apply_settings_to_gui()` / `collect_settings_from_gui()`: Two-way sync between Rust settings and Slint globals.

### [`src/settings/gui_settings_values.rs`](cedinia/src/settings/gui_settings_values.rs)

Defines `StringComboBoxItem<T>` with a `config_name`, `display_name`, optional `i18n_key`, and typed `value`. Used for:
- Min/Max file size
- Duplicate check method, hash type
- Hash size, algorithm, image filter
- Similarity preset
- Big files search mode and count
- Same music check method

### [`src/model.rs`](cedinia/src/model.rs)

- `make_file_model()`: Converts `Vec<FileItem>` → `ModelRc<FileEntry>` for Slint.
- `toggle_row()`: Toggles checked state (skips headers and references).
- `count_checked()`: Counts checked entries in a model.

### [`src/translations.rs`](cedinia/src/translations.rs)

Sets all ~270 translatable strings on the `Translations` Slint global by calling `flc!("key")`. Called on startup and on language change.

### [`src/set_initial_gui_infos.rs`](cedinia/src/set_initial_gui_infos.rs)

Validates that the combo box string lists in Slint match those defined in Rust using `assert_eq!` — catches out-of-sync bugs at startup.

---

## Slint UI Structure

### [`ui/main_window.slint`](cedinia/ui/main_window.slint) — Root

- Window with `min-width: 320px`, `min-height: 480px`, `preferred: 390×844` (mobile form factor).
- Safe-area-aware padding using `root.safe-area-insets` and `AppState.inset_bottom`.
- Routes between screens based on `AppState.active_tool` (`ActiveTool` enum).
- Renders: `TopAppBar` → `ScanProgressBar` → content area (one of `HomeScreen`, `SettingsScreen`, `DirectoriesScreen`, `ResultsList`, or `SimilarImagesGallery`) → `BottomNavBar`.
- Overlays: `ImageCompareOverlay` (z:100), stopping overlay (z:150), permission popup (z:200).
- **11 result models**: `duplicate_files_model`, `empty_folder_model`, `similar_images_model`, `similar_images_groups`, `empty_files_model`, `temporary_files_model`, `big_files_model`, `broken_files_model`, `bad_extensions_model`, `same_music_model`, `bad_names_model`, `exif_remover_model`.

### [`ui/app_state.slint`](cedinia/ui/app_state.slint) — Global singletons

Defines **7 Slint globals**:

| Global | Purpose |
|--------|---------|
| `GeneralSettings` | Cache, hidden files, notifications, file size limits, language, exclusions, dark theme |
| `DuplicateSettings` | Check method, hash type |
| `SimilarImagesSettings` | Similarity preset, hash size/alg, image filter, ignore options, gallery fit |
| `SameMusicSettings` | Tag comparison flags (title/artist/year/length/genre/bitrate), approximate, check method |
| `TemporaryFilesSettings` | Extensions list |
| `BrokenFilesSettings` | Check audio/PDF/archive/image |
| `BadNamesSettings` | Check flags for 5 criteria |
| `BigFilesSettings` | Search mode (biggest/smallest), file count |
| `AppState` | ~80 properties and ~60 callbacks for all UI state |

### [`ui/colors.slint`](cedinia/ui/colors.slint) — Dark/Light theme

Amber/gold accent palette (`#c8960c`). The `CediniaColors` global adapts all colors to `GeneralSettings.use_dark_theme`. Key design choice: image viewer background is always dark, and the diff background is pure black for visibility.

### [`ui/common.slint`](cedinia/ui/common.slint) — Shared types

Enums: `SettingsTab` (3 tabs), `ConfirmPopupAction` (5 actions), `ActiveTool` (14 variants), `ScanState` (5 states).
Structs: `SimilarImageItem`, `SimilarGroupCard`, `CompareImageData`, `ProgressData`, `FileEntry`, `DirectoryEntry`, `VolumeEntry`, `CollectTestResult`.

### [`ui/components.slint`](cedinia/ui/components.slint) — Reusable components

- `TouchButton`: Tappable button with label, configurable bg/fg colors.
- `IconButton`: Icon button with colorize support.
- `FileRow`: Result list row with checkbox (or "R" for reference), name, path, size, long-press context menu.
- `Divider`: 1px horizontal line.
- `StatusChip`: Rounded label badge.

### [`ui/home_screen.slint`](cedinia/ui/home_screen.slint)

Grid of `ToolCard` components — one for each of the 11 scanning tools. Each card has an emoji icon, title, description, and accent color. Tapping navigates to the tool's results screen.

### [`ui/results_list.slint`](cedinia/ui/results_list.slint)

The primary results view. Features:
- **Action bar**: Delete (if `can_delete`), Clean EXIF, Rename buttons when items are selected, plus select/deselect/gallery mode toggle buttons.
- **`ListView`** with `FileRow` for each entry.
- **Empty state**: Shows emoji + state-appropriate text (scanning/stopping/no results/press start).
- **No-permission warning**: Shows a "Grant" button if `storage_permission_granted` is false.
- **FAB**: Floating action button (56px circle) with play/stop icon — primary scan control.
- **Selection/deselection popups**: Centered modal with all size/resolution selection options.
- **Context menu**: Long-press on a row opens a popup with "Open item" / "Open parent folder".
- **Confirm popup**: For delete/rename actions.
- **Delete errors popup**: Shows errors from failed operations.

### [`ui/similar_images_gallery.slint`](cedinia/ui/similar_images_gallery.slint)

Gallery view for similar images. Features:
- **Momentum-scrollable groups** using `SwipeGestureHandler` for horizontal scrolling within each group.
- **`GalleryImageCell`**: Shows thumbnail, name, size, path. Has long-press with 500ms timer, dead-zone detection, and gesture-steal cancellation.
- **Compare button** on each group header.
- **Selection popup** (same options as results list).
- **Gallery delete popup** with warning when entire groups would be deleted.
- **Delete progress overlay** with stop button.
- **FAB**: Same as results list.

### [`ui/image_compare.slint`](cedinia/ui/image_compare.slint)

Full-screen image comparison overlay. Four modes:
- **Normal** (side-by-side): Two panels with checkboxes at corners.
- **Split**: Left/right clipped at slider position.
- **Overlay**: Right image superimposed with adjustable opacity.
- **Diff**: Per-pixel difference visualization (pixelated rendering).

Includes: action bar (prev/swap/back/info/next), info panel showing file details, mode selector buttons, thumbnail strip with L/R selection.

### [`ui/settings_screen.slint`](cedinia/ui/settings_screen.slint)

Three-tab settings screen:
- **General**: Scan settings (cache, hidden, notifications), filters (min/max file size), language, appearance (dark theme), common settings (excluded items/extensions).
- **Tools**: Per-tool configuration for all 11 scanning tools.
- **Info/Diagnostics**: About section with logo, cache management, collect test, storage permission, licenses.

### [`ui/directories_screen.slint`](cedinia/ui/directories_screen.slint)

Directory management with:
- Included/excluded directory lists with status indicators (green/red accent bar).
- Reference toggle for included dirs (marked "R").
- Volumes popup: Lists detected storage volumes with include/exclude buttons.
- Custom Paths popup: Quick actions per volume (include/exclude via folder picker or text edit).
- Path edit popup: Manual path entry with existence validation.
- Directory statistics popup ("Analyze"): Shows file counts and sizes for included/excluded/referenced/would-scan/processable paths.

### [`ui/bottom_nav.slint`](cedinia/ui/bottom_nav.slint)

4-tab bottom navigation bar:
1. **Home** (icon: `cedinia_home.svg`)
2. **Dynamic tool** (shows last used tool with its icon)
3. **Directories** (icon: `cedinia_folder.svg`)
4. **Settings** (icon: `cedinia_more.svg`)

### [`ui/top_bar.slint`](cedinia/ui/top_bar.slint)

Simple app bar with logo, dynamic title (based on active tool), and status message. Shows an animated pulsing dot during scanning.

### [`ui/scan_progress.slint`](cedinia/ui/scan_progress.slint)

Animated progress bar (200ms height animation on show/hide). Displays step name, progress counter, and either a determinate progress bar or indeterminate placeholder.

### [`ui/settings_components.slint`](cedinia/ui/settings_components.slint)

Reusable settings widgets:
- `ToggleRow`: Switch toggle with label and optional description.
- `SegmentRow`: Horizontal button segments for option selection.
- `ToolGroupHeader`: Colored section header with emoji.
- `CategoryLabel`: Muted uppercase category label.
- `DropdownRow`: Inline accordion-style dropdown (no PopupWindow, so scrolling works correctly).
- `TextInputRow`: Text input with label, placeholder, and focus styling.

---

## Android Integration

### Android Manifest (`AndroidManifest.xml`)

The manifest at [`cedinia/android/app/src/main/AndroidManifest.xml`](cedinia/android/app/src/main/AndroidManifest.xml) declares:
- **Activity**: `android.app.NativeActivity` (no subclass required)
  - `configChanges`: Prevents Activity recreation on common changes (orientation, keyboard, screen size, navigation, locale, density, fontScale)
  - `launchMode = "singleTop"`: Prevents stacking multiple Activity instances
- **Permissions**: `MANAGE_EXTERNAL_STORAGE`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `POST_NOTIFICATIONS`

### Java helpers

Three Java files are compiled to DEX at build time and loaded dynamically at runtime:

| File | Purpose |
|------|---------|
| [`CediniaActivity.java`](cedinia/java/CediniaActivity.java) | `NativeActivity` subclass that prevents fullscreen mode, resets navigation visibility on focus, moves task to background on back press, and forwards `onActivityResult` to `CediniaFilePicker`. |
| [`CediniaFilePicker.java`](cedinia/java/CediniaFilePicker.java) | Storage permission management, file/folder/URL opening, and folder picker via SAF (`ACTION_OPEN_DOCUMENT_TREE`) with fallback to text-entry dialog. |
| [`CediniaPickerFragment.java`](cedinia/java/CediniaPickerFragment.java) | Headless `Fragment` that correctly handles `startActivityForResult`/`onActivityResult` even with plain `NativeActivity`. |

### DEX loading flow

1. `build.rs` compiles Java → `.class` → `classes.dex`.
2. `file_picker_android::init()` loads `classes.dex` via `include_bytes!`.
3. Tries `InMemoryDexClassLoader` first (API 26+), falls back to `DexClassLoader` with file-based cache.
4. Registers the native method `onDirectoryPicked` so Java can call back into Rust.

### Edge-to-edge layout

- `inset_bottom` from Android content rect is plumbed through to Slint.
- A timer polls `content_rect()` every 50ms until the bottom inset stabilizes.
- `padding-bottom` in the main window uses `max(AppState.inset_bottom, root.safe-area-insets.bottom)`.

### Storage Permission

- **Android 11+** (`API 30+`): Opens `Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION`.
- **Android 6-10** (`API 23-29`): Uses `requestPermissions` for `READ/WRITE_EXTERNAL_STORAGE`.
- Polled every 2 seconds in the timer loop.

---

## Internationalization (i18n)

### Structure

Based on Fluent (`.ftl`) files. The [`i18n/`](cedinia/i18n/) directory contains `cedinia.ftl` for each of **28 languages**:

- `en` (English, fallback), `pl`, `fr`, `it`, `ru`, `uk`, `ko`, `cs`, `de`, `ja`, `pt-PT`, `pt-BR`, `zh-CN`, `zh-TW`, `es-ES`, `no`, `sv-SE`, `ar`, `bg`, `el`, `nl`, `ro`, `tr`, `fa`, `hi`, `id`, `vi`

### Usage in code

- **Rust**: `flc!("key")` or `flc!("key", var = value)` — resolves via `LANGUAGE_LOADER_CEDINIA`.
- **Slint UI**: Translatable strings are properties on the `Translations` global, set from Rust via `translate_items()`.
- **Combo boxes**: Some options (e.g., "Very High", "Medium") use translatable keys with matching `i18n_key` fields in `StringComboBoxItem`.

### Important note

Only the English `cedinia.ftl` is edited directly in the repo. All other languages are managed through Crowdin and would be overwritten on sync.

---

## Icons

Six SVG icons in [`icons/`](cedinia/icons/):

| File | Used In |
|------|---------|
| `cedinia_duplicate.svg` | Dynamic tool nav item (default) |
| `cedinia_folder_empty.svg` | Empty Folders tool nav item |
| `cedinia_folder.svg` | Directories nav tab |
| `cedinia_home.svg` | Home nav tab |
| `cedinia_image.svg` | Similar Images tool nav item |
| `cedinia_logo.svg` | Top bar logo + Settings diagnostics page |
| `cedinia_logo_horizontal.png` | README |
| `cedinia_logo_horizontal.svg` | README |
| `cedinia_more.svg` | Settings nav tab (three dots) |

The image compare overlay reuses icons from krokiet's icon set (`../../krokiet/icons/krokiet_compare_*.svg`, `krokiet_info.svg`).

---

## Key Differences from Krokiet

| Aspect | Krokiet (Desktop) | Cedinia (Mobile/Android) |
|--------|-------------------|--------------------------|
| **Primary target** | Linux desktop (winit) | Android (android-activity) |
| **Slint backend** | `backend-winit` + `renderer-winit-femtovg` | `backend-android-activity-06` |
| **Video tools** | Full `similar_videos` + `video_optimizer` | **None** — ffmpeg not available on Android |
| **File picker** | `rfd` (native dialog) | JNI → SAF `ACTION_OPEN_DOCUMENT_TREE` + text fallback |
| **Delete behavior** | Uses `trash` crate (recycle bin) | Direct `std::fs::remove_file`/`remove_dir_all` |
| **Notifications** | `notify-rust` + `notify-send` | JNI → Android `NotificationManager` |
| **trash dependency** | Yes (`trash` crate) | No (incompatible with Android) |
| **File dialogs** | `rfd` (xdg-portal) | Custom Java/Saf picker via JNI |
| **Storage permissions** | Not applicable | Runtime MANAGE_EXTERNAL_STORAGE |
| **Edge-to-edge** | Not needed | System insets plumbed to Slint |
| **Navigation** | Side panel + top bar | Bottom nav bar (4 tabs) |
| **Dark theme** | System-based | Toggle in settings |
| **Scan control** | Menu bar + buttons | FAB (floating action button) |
| **Results view** | Side panel + detail area | Full-screen results list or gallery |
| **Image compare** | Separate window | Full-screen overlay within app |
| **Similar images** | List only | List + gallery view with swipeable rows |
| **Context menu** | Right-click | Long-press with dead-zone detection |
| **Settings layout** | Tabbed in side panel | 3-tab in-page settings |
| **Language detection** | OS locale | OS locale (desktop) or manual (Android) |
| **Slint style** | Fluent (Cosmic) | Material |
| **Window size** | Desktop-sized (1024×768+) | Mobile-sized (390×844, min 320×480) |
| **Safe area handling** | None | `safe-area-insets` + Android `inset_bottom` |
| **About dialog** | Popup window | Part of diagnostics settings tab |

### Why no video tools on Android?

According to [`scan_runner.rs`](cedinia/src/scan_runner.rs) and the scanner list in [`scanners.rs`](cedinia/src/scanners.rs), video scanning tools (`similar_videos`, `video_optimizer`) are **not imported or wired** in Cedinia. The `stage_label` function in `scan_runner.rs` still maps video-related stages (e.g., `SimilarVideosCalculatingHashes`, `VideoOptimizerProcessingVideos`) to their translated labels, but no `ScanRequest` variants or scanner functions exist for them. The reason is that **ffmpeg is not available on Android** — the `video_utils` module in `czkawka_core` depends on `ffmpeg-next`, which is not compiled for Android targets, so those tools cannot function.

### Architectural similarity

Despite the differences, Cedinia follows the same architectural pattern as Krokiet:
1. Shared scanning engine via `czkawka_core`.
2. Worker thread with crossbeam channels for progress/results.
3. Slint globals for state + callbacks for Rust→UI interaction.
4. Fluent-based i18n with compile-time embedded translations.
5. Generation-based cancellation for thumbnails and image comparison.
