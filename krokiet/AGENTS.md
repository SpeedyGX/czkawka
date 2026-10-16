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
├── src/                              # Rust side — entry point `fn main` (src/main.rs:96); connect_scan.rs
│                                     #   + connect_scan/<tool>.rs, connect_*/ callbacks, file_actions/,
│                                     #   model_operations/, settings/, shared_models.rs, common.rs
└── ui/                               # Slint UI — `.slint` files are not in the knowledge graph, read directly
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

`SharedModels` (`src/shared_models.rs:22`) holds one `Option<…>` state field per tool (14 tools), so the
whole scan state is reachable through a single struct.

Created once in `main.rs` as `Arc<RwLock<SharedModels>>`, cloned and passed to
every callback that needs scan results (preview, compare, save, delete, …).

Worker threads lock exclusively (`write()`) to store results after a scan finishes.
UI callbacks lock briefly (`read()`) to access results for previews / exports.
The `SharedModels::new_shared()` helper wraps the constructor in `Arc::new(RwLock::new(…))`.

### Convenience methods

`SharedModels` provides `get_<tool>_ref()` and `get_<tool>_ref_mut()` accessor methods
wired to the current `ActiveTab`, so callbacks don't need to match on the tab enum
manually (one pair per tool).

---

## Scan Data Flow

`on_scan_starting(active_tab)` → `collect_settings()` (`src/settings/mod.rs:617`) builds a `ScanData` →
`connect_scan.rs` routes to `scan_<tool>()`, which spawns a worker thread that configures the tool, calls
`tool.search(...)`, stores it in `shared_models`, fills a Slint `VecModel<SingleMainListModel>` and hands
it to the UI via `app.upgrade_in_event_loop(…)`.

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

Column indices are constants in `src/common.rs` — one `StrData*` / `IntData*` enum pair per tool
(e.g. `StrDataDuplicateFiles`, `IntDataDuplicateFiles`).

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

The entry point follows a fixed order; the order matters when adding new features:

1. Image-decoding hooks → config/cache paths → `process_cli_args()` → load settings → logger →
   ensure the default config files exist.
2. `MainWindow::new()` (Slint window — may fail, show a critical error) → `zeroing_all_models(&app)` →
   `SharedModels::new_shared()` → `AudioPlayer::new()` (optional) → push the initial GUI state from JSON →
   background hardware-encoder probe.
3. Wire all callbacks (order matters — some depend on prior state), then `app.run()`, which **blocks**
   until the window closes, and finally save the settings.

Per-step detail: graph query against `main.rs`.

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
