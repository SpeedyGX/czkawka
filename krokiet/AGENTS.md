# krokiet – Architecture Guide

## Overview

Primary desktop GUI. Built with [Slint](https://slint.dev/) (GPL-3.0). The UI
is declared in `ui/*.slint`; Rust wires all callbacks and drives the Slint data
models. All scanning logic lives in `czkawka_core`.

---

## Source Layout

```
krokiet/
├── build.rs                          # slint_build::compile("ui/main_window.slint")
├── src/
│   ├── main.rs                       # Entry point: load settings, create MainWindow,
│   │                                  #   wire all callbacks, run event loop
│   ├── shared_models.rs              # SharedModels – Arc<RwLock<…>> of all tool results
│   ├── common.rs                     # Column index enums (IntDataDuplicateFiles, …)
│   │                                  #   and sort index helpers (635 lines)
│   ├── active_tab_meta.rs            # Tool metadata (icon path, tool title, supported actions)
│   ├── localizer_krokiet.rs          # flk! macro, LANGUAGE_LOADER_KROKIET
│   ├── set_initial_gui_info.rs       # Asserts Slint combo lists == Rust enums
│   ├── set_initial_scroll_list_data_indexes.rs
│   ├── simpler_model.rs              # Minimal serializable row struct for threading
│   ├── audio_player.rs               # Play sound on scan completion (optional `audio` feature)
│   ├── notification_manager.rs       # Desktop notifications
│   ├── create_calculate_task_size.rs # Background total-size calculator
│   ├── clear_outdated_video_thumbnails.rs
│   ├── connect_scan.rs               # Routes scan to per-tool functions
│   ├── connect_scan/                 # One file per tool (14 files)
│   ├── connect_progress_receiver.rs  # Receives ProgressData → updates UI bar
│   ├── connect_row_selection.rs      # Row checkbox logic, group handling
│   ├── connect_sort.rs               # Column-header sort (string + int indices)
│   ├── connect_translation.rs        # LANGUAGE_LIST, change_language(), translate_items()
│   ├── connect_compare.rs            # Image comparison overlay
│   ├── connect_show_preview.rs       # File preview / thumbnail
│   ├── connect_open.rs               # Open file/folder in system app
│   ├── connect_save.rs               # Export results via PrintResults
│   ├── connect_show_confirmation.rs  # Confirmation popup before destructive action
│   ├── connect_directories_changes.rs
│   ├── connect_filter.rs             # Extension/excluded-items filter UI
│   ├── connect_metadata.rs           # File metadata display
│   ├── connect_clean_cache.rs
│   ├── connect_tab_changed.rs
│   ├── connect_stop.rs               # Sets stop_flag = true
│   ├── connect_rfd.rs                # File picker (rfd)
│   ├── connect_select/
│   │   ├── mod.rs
│   │   └── custom_select.rs          # Advanced filter popup
│   ├── file_actions/
│   │   ├── connect_delete.rs
│   │   ├── connect_move.rs
│   │   ├── connect_rename.rs
│   │   ├── connect_hardlink.rs
│   │   ├── connect_symlink.rs
│   │   ├── connect_optimize_video.rs
│   │   └── connect_clean_exif.rs
│   ├── model_operations/
│   │   ├── mod.rs                    # Slint model ↔ thread-safe model conversion
│   │   └── model_processor.rs        # Parallel item processing framework
│   ├── test_common.rs                # #[cfg(test)] test utilities
│   └── settings/
│       ├── mod.rs                    # Load/save JSON settings (11 presets)
│       ├── model.rs                  # BasicSettings, SettingsCustom structs
│       └── combo_box.rs              # StringComboBoxItems + regenerate_items()
└── ui/
    ├── main_window.slint             # Root component; imports everything; exports globals
    ├── common.slint                  # Enums + structs: ActiveTab, SingleMainListModel, …
    ├── gui_state.slint               # Global GuiState (transient runtime state)
    ├── settings.slint                # Global Settings (persisted)
    ├── translations.slint            # Global Translations (all UI strings)
    ├── callabler.slint               # Global Callabler (all Rust→UI callbacks)
    ├── left_side_panel.slint         # Tool selector + tool settings sub-panel
    ├── main_lists.slint              # Results table (bound to model)
    ├── action_buttons.slint          # Scan / Stop / Select / Delete / … buttons
    ├── bottom_panel.slint            # Progress bar + error text + status
    ├── progress.slint                # Real-time scan progress widget
    ├── preview.slint                 # File preview / thumbnail side panel
    ├── image_compare.slint           # Side-by-side image diff overlay
    ├── settings_list.slint           # Settings tab form
    ├── tool_settings.slint           # Per-tool options (hash alg, threshold, …)
    ├── about.slint                   # About tab
    ├── selectable_tree_view.slint    # Custom tree widget for path lists
    ├── fonts.slint                   # FontSizes global
    ├── color_palette.slint           # Dark-theme color definitions
    └── popup_*.slint                 # 15 modal dialogs
```

---

## Slint Performance: ListView vs. for-in / ScrollView

When displaying more than a few dozen items, **always use `ListView`** (from
`std-widgets.slint`)
rather than a bare `ScrollView` / `for` loop inside a `VerticalLayout`.

```slint
// SLOW – instantiates every item upfront, O(n) per frame
ScrollView {
    VerticalLayout {
        for item in model : Row { ... }
    }
}

// SLOW - same as above
VerticalLayout {
    for item in model : Row { ... }
}

// FAST – virtual scroll via Flickable's Repeater optimization
ListView {
    for item in model : Row { ... }
}
```

`ListView` uses Slint's Repeater-inside-Flickable
optimization: only visible rows (plus a small buffer) are instantiated at any
given time.  With a plain `ScrollView` + `VerticalLayout`, all N items are
created and visited on every frame.

Reference: Slint issue [#11021](https://github.com/slint-ui/slint/issues/11021).

---

## SharedModels (`src/shared_models.rs`)

```rust
pub struct SharedModels {
    pub shared_duplication_state:       Option<DuplicateFinder>,
    pub shared_empty_folders_state:     Option<EmptyFolder>,
    pub shared_empty_files_state:       Option<EmptyFiles>,
    pub shared_temporary_files_state:   Option<Temporary>,
    pub shared_big_files_state:         Option<BigFile>,
    pub shared_similar_images_state:    Option<SimilarImages>,
    pub shared_similar_videos_state:    Option<SimilarVideos>,
    pub shared_same_music_state:        Option<SameMusic>,
    pub shared_same_invalid_symlinks:   Option<InvalidSymlinks>,
    pub shared_broken_files_state:      Option<BrokenFiles>,
    pub shared_bad_extensions_state:    Option<BadExtensions>,
    pub shared_bad_names_state:         Option<BadNames>,
    pub shared_exif_remover_state:      Option<ExifRemover>,
    pub shared_video_optimizer_state:   Option<VideoOptimizer>,
}
```

Created once in `main.rs` as `Arc<RwLock<SharedModels>>`, cloned and passed to
every callback that needs scan results (preview, compare, save, delete, …).

Worker threads lock exclusively (`write()`) to store results after a scan finishes.
UI callbacks lock briefly (`read()`) to access results for previews / exports.
The `SharedModels::new_shared()` helper wraps the constructor in `Arc::new(RwLock::new(…))`.

### Convenience methods

`SharedModels` provides `get_<tool>_ref()` and `get_<tool>_ref_mut()` accessor methods
wired to the current `ActiveTab`, so callbacks don't need to match on the tab enum
manually:

```rust
impl SharedModels {
    pub fn get_duplicate_state_ref(&self, active_tab: ActiveTab) -> Option<&DuplicateFinder>;
    pub fn get_similar_images_state_ref(&self, active_tab: ActiveTab) -> Option<&SimilarImages>;
    // … one pair per tool
}
```

---

## Scan Data Flow

```
1. User clicks Scan → on_scan_starting(active_tab)
2. connect_scan.rs: collect_settings() → ScanData → route to scan_<tool>()
3. scan_<tool>(): spawn worker thread
       → create and configure tool struct
       → tool.search(stop_flag, progress_sender)
       → store tool in shared_models.lock()
       → populate Slint VecModel<SingleMainListModel>
       → app.upgrade_in_event_loop(|app| app.set_<tool>_model(model))
4. UI re-renders with new model
```

---

## Slint Data Model

```rust
// ui/common.slint
export struct SingleMainListModel {
    checked: bool,           // row selected by user
    header_row: bool,        // group header
    filled_header_row: bool, // header with formatted summary
    selected_row: bool,      // UI highlight
    val_str: [string],       // text columns
    val_int: [int],          // numeric columns (raw values for sorting)
}
```

Column indices are constants in `src/common.rs`:

```rust
pub enum StrDataDuplicateFiles { Size, Name, Path, ModificationDate }
pub enum IntDataDuplicateFiles { ModificationDatePart1, ModificationDatePart2,
                                  SizePart1, SizePart2 }
```

Slint cannot store `i64`, so dates and file sizes are split into two `i32` fields.

---

## Translation System

Slint has no native Fluent support. Workaround:
1. All UI text is bound to properties in the `Translations` global
   (`ui/translations.slint`), not hardcoded in `.slint`.
2. `translate_items()` in `connect_translation.rs` (~350 lines) sets every
   property via `flk!("key")` after language changes.
3. Language list defined as `LANGUAGE_LIST: &[Language]` in
   `connect_translation.rs`.
4. Hardcoded combo-box lists in `.slint` files (e.g. `Settings.languages_list`)
   are verified at startup against Rust enums via `assert_eq!` in
   `set_initial_gui_info.rs` (workaround for [slint#7632](https://github.com/slint-ui/slint/issues/7632)).

---

## Settings (`src/settings/`)

Two-tier JSON system:

| File | Content |
|------|---------|
| `~/.config/Czkawka/krokiet/base.json` | `BasicSettings` – default preset index, preset names, theme, window size |
| `~/.config/Czkawka/krokiet/preset_N.json` | `SettingsCustom` – paths, extensions, tool parameters |

11 preset slots (indices 0–10). Slot 10 is reserved for CLI-mode overrides.
`StringComboBoxItems::regenerate_items()` builds all combo box option arrays
from Rust enums; used both for settings serialization and UI initialization.

---

## Main Initialization Flow (`main.rs`)

The entry point follows a fixed order. Understanding this order is essential when
adding new features:

```
1. register_image_decoding_hooks()        # Image format support (via czkawka_core)
2. set_config_cache_path("Czkawka", "Krokiet")
3. process_cli_args()                     # CLI overrides: paths, tool (-t), preset (-p), scan (-s), exit (-x)
4. load_initial_settings_from_file()      # Read base.json + preset_N.json
5. setup_logger() / print_version_mode()
6. create_default_settings_files()        # Ensure config files exist
7. MainWindow::new()                      # Slint window — may fail (show critical error)
8. zeroing_all_models(&app)               # Set all 14 models to empty VecModel
9. SharedModels::new_shared()             # Arc<RwLock<SharedModels>>
10. AudioPlayer::new()                    # Optional (audio feature)
11. set_initial_gui_infos(&app)           # Sync Slint combo lists with Rust enums
12. set_initial_settings_to_gui(&app, …)  # Populate all Slint globals from JSON
13. update_available_hardware_encoders()  # Background thread: probe FFmpeg HW encoders

// Wire all callbacks (order matters — some depend on prior state):
14. connect_delete_button() / connect_trash_button()
15. connect_scan_button()
16. connect_stop_button()
17. connect_open_items()
18. connect_progress_gathering()
19. connect_add_remove_directories()
20. connect_filter()
21. connect_show_preview()
22. connect_compare()
23. connect_translations()
24. connect_changing_settings_preset()
25. connect_select()
26. connect_move() / connect_rename() / connect_optimize_video() / connect_clean_exif()
27. connect_hardlink() / connect_symlink()
28. connect_save()
29. connect_row_selections()
30. connect_sort() / connect_sort_column()
31. connect_tab_changed()
32. create_calculate_task_size()
33. connect_clean_cache()
34. connect_show_confirmation()

35. clear_outdated_video_thumbnails()
36. app.invoke_initialize_popup_sizes()   # Force popups to measure their size once
37. app.run()                             # Slint event loop — BLOCKS until window closes
38. save_all_settings_to_file()           # Persist on clean exit
```

### CLI-driven start scan

`process_cli_args()` (in `czkawka_core::common::basic_gui_cli`) also recognises `-t/--tool TOOL`,
`-p/--preset N`, `-s/--scan` and `-x/--exit`. When `--scan` is given, `main.rs` selects the
requested tool tab (`ActiveTab::from_tool_type`), aborts with an error if no non-referenced
included folder is configured, and — right before `app.run()` — sets `scanning` and calls
`invoke_scan_starting()`. `--exit` (requires `--scan`) runs a 200 ms timer that quits the event
loop once `scanning` turns false. Launching with none of these arguments keeps the previous
behaviour.

### Generated Slint Code Wrapper

Slint-generated code uses `unwrap()` and indexing in some callbacks. To avoid
cluttering the entire crate with clippy allows, the generated code is wrapped:

```rust
// main.rs
mod generated_slint_code {
    #![allow(clippy::unwrap_used, clippy::indexing_slicing)]
    slint::include_modules!();
}
pub use generated_slint_code::*;
```

### `zeroing_all_models()`

Sets all 14 tool models to empty `VecModel` before the event loop starts. Each
tool has a dedicated setter on `MainWindow` (e.g., `app.set_duplicate_files_model()`).
Must be updated when adding a new tool.

### Hardware Encoder Probe

`update_available_hardware_encoders()` runs in a **background thread** with per-encoder
timeouts (driver initialization can hang). Results are sent back via
`slint::invoke_from_event_loop()` and the `Settings.video_optimizer_sub_hardware_encoder_*`
combo box is updated to only show working encoders.

---

## Callback Registration Pattern

```rust
let weak = app.as_weak();
app.global::<Callabler>().on_some_action(move || {
    let app = weak.upgrade().expect("MainWindow dropped while callback is still live");
    // use app …
});
```

`expect()` is correct here: if the window is gone, no callback should fire.
Cross-thread updates use `weak.upgrade_in_event_loop(|app| { … })`.

---

## Key Dependencies

| Crate | Purpose |
|-------|---------|
| `slint` 1.17 | UI framework (GPL-3.0) |
| `czkawka_core` | Scanning engine |
| `i18n-embed` + `rust-embed` | Fluent translations |
| `crossbeam-channel` | Progress + result channels |
| `rayon` | Parallel result sorting |
| `serde_json` | Settings persistence |
| `image` | Thumbnail loading |
| `rfd` 0.17 | File picker (xdg-portal backend) |
| `notify-rust` | Desktop notifications |
| `rodio` | Scan-complete sound (optional `audio` feature) |
| `fontique` | Font discovery (dlopen, avoids C dep) |

### Optional features

- `audio` – scan-complete sound via `rodio`
- Renderer features: `winit_femtovg` (default), `winit_software` (default),
  `skia_opengl`, `skia_vulkan`, etc. – select GPU backend at compile time
- `heif`, `libraw`, `libavif`, `xdg_portal_trash` – forwarded to `czkawka_core`

### Build

`build.rs` compiles `ui/main_window.slint` with style `fluent-dark` (overridable
via `SLINT_STYLE` env var).

---

## Child DOX Index

None (leaf node — internal modules `connect_scan/`, `file_actions/`, `settings/`, `model_operations/`, `connect_select/` are not durable boundaries).
