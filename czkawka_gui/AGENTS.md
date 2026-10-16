# czkawka_gui – Architecture Guide

## Status: Maintenance mode only

No new features. Bug-fixes that keep it compatible with `czkawka_core` API
changes are accepted.

---

## Overview

GTK4 frontend using XML UI files authored in Cambalache. All scanning tools
available in `czkawka_core` are exposed via a notebook (tab-based) interface.

---

## Source Layout

```
czkawka_gui/src/                     # Rust side — entry point `fn main` (src/main.rs:75)
├── gui_structs/gui_data.rs:50       # GuiData – central struct for all UI components
├── connect_things/                  # Callback wiring (connect_button_search.rs:45 and friends)
├── compute_results.rs               # Converts scan results → GTK ListStore rows
├── helpers/                         # Column enums, ListStore ops, image ops, TreeView iteration
├── initialize_gui.rs                # Initial widget state
├── saving_loading.rs                # JSON settings load/save
├── language_functions.rs            # LANGUAGES_ALL constant (26 entries)
├── localizer_gui.rs                 # flg! macro, Fluent loader
├── help_functions.rs                # HEADER_ROW_COLOR, MAIN_ROW_COLOR, set_buttons
├── help_combo_box.rs                # Combo box option arrays (hash algs, etc.)
├── notebook_enums.rs / notebook_info.rs  # Tab indices, tab labels, ListStore column definitions
├── opening_selecting_records.rs     # Double-click → open file/folder
├── taskbar_progress.rs              # Windows/dummy taskbar progress
└── gtk_traits.rs                    # Custom GTK trait extensions

ui/                                  # Cambalache XML — not in the knowledge graph, edit via Cambalache
├── main_window.ui      # Cambalache XML (65 KB) – entire main window layout
├── settings.ui         # Settings dialog
├── compare_images.ui   # Image comparison panel
├── popover_select.ui   # Selection filter popover
├── popover_sort.ui     # Sort popover
├── about_dialog.ui     # About window
└── progress.ui         # Scan progress dialog
```

---

## GuiData Struct (`gui_structs/gui_data.rs`)

`GuiData` (`src/gui_structs/gui_data.rs:50`) is the central struct passed by clone/reference to every
callback: the main window, the 11-tool main notebook, the directory notebooks, the bottom buttons, the
progress/settings/header/about/compare sub-structs, the select/sort popovers, the info and error widgets,
the taskbar state, the shared-buttons map and the `stop_flag`.

Its field-level composition: graph query.

Constructed by `GuiData::new_with_application()` which loads all `.ui` files
via `gtk4::Builder`.

---

## Scan Thread Architecture

Clicking Search goes through `connect_button_search()` (`src/connect_things/connect_button_search.rs:45`):
it disables the UI and shows the progress window, then spawns a worker thread that reads the settings from
the GTK widgets, creates the tool struct, calls `tool.search(stop_flag, progress_sender)` and sends the
finished tool back over `result_sender`. The main thread updates the progress bars meanwhile, and when the
result arrives it runs `compute_results.rs` to append rows to the `ListStore`, then re-enables the UI and
hides the progress window.

**Channel types:**
- `Sender<Message>` – one-shot result channel (tool enum with full data)
- `Sender<ProgressData>` – real-time progress from core

---

## Result Population (`compute_results.rs`)

The worker `Message` is unpacked into sorted file groups; each group gets a **header row**
(`HEADER_ROW_COLOR`) followed by one row per file (`MAIN_ROW_COLOR`), written cell by cell with
`append_row_to_list_store()` (`src/helpers/list_store_operations.rs:251`). `finalize_compute()`
(`src/compute_results.rs:60`) then stores the tool object in `SubView.shared_model_enum` for later re-use
by the selection/sort callbacks.

---

## Language Switching (`language_functions.rs`)

26 languages defined as `LANGUAGES_ALL: &[Language]` with `combo_box_text`
(display name) and `short_text` (BCP-47 code).

On language change:
1. Look up `short_text` from selected combo index.
2. Call `localizer.select([lang_id])` for both `czkawka_core` and `czkawka_gui`.
3. Call `gui_data.update_language()` → propagates to all sub-structs which
   update their widget labels via `flg!("key")`.

---

## Settings Storage (`saving_loading.rs`)

JSON file at `~/.config/Czkawka/czkawka_gui_config.json`. Struct `SettingsJson`
serialized with `serde_json`. Includes directories, tool parameters, UI state,
language preference.

---

## Key Dependencies

| Crate | Purpose |
|-------|---------|
| `gtk4` 0.11 | GTK4 GUI framework |
| `gdk4` 0.11 | Drawing/rendering |
| `glib` 0.22 | Event loop, `spawn_future_local` |
| `i18n-embed` + `rust-embed` | Fluent translations |
| `open` 5.3 | Launch file manager |
| `image` 0.25 | Preview thumbnails |
| `resvg` 0.47 | SVG icon scaling |
| `rayon` 1.10 | Parallel sort of results |
| `crossbeam-channel` | Result + progress channels |
| `czkawka_core` | Scanning engine |

Optional features (forwarded to core): `heif`, `libraw`, `libavif`,
`xdg_portal_trash`.

---

## Child DOX Index

None (leaf node — internal modules `gui_structs/`, `connect_things/`, `helpers/` are not durable boundaries).
