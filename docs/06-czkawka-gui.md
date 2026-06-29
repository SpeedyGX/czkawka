# czkawka_gui – Legacy GTK 4 GUI

> **Status: Maintenance mode only** — No new features are added. Bug-fixes that keep it compatible with core API changes are accepted. All new features should go to [`krokiet`](../krokiet/) (Slint-based GUI).

## 1. Overview

`czkawka_gui` is the original desktop GUI for Czkawka, built with **GTK 4** via the [`gtk4-rs`](https://gtk-rs.org/) bindings (version 0.11.0). It provides a graphical interface to all scanning tools in [`czkawka_core`](../czkawka_core/) except three: `ExifRemover`, `VideoOptimizer`, and `BadNames` (11 of 14 tools).

| Property | Value |
|----------|-------|
| Crate name | `czkawka_gui` |
| Version | `11.0.1` |
| Rust edition | `2024` |
| Minimum Rust | `1.92.0` |
| License | MIT |
| UI framework | GTK 4 (`v4_6`) via `gtk4-rs` 0.11.0 |
| UI definition | XML (Cambalache/Glade) `.ui` files embedded via `include_str!()` |
| Model | `gtk4::ListStore` + `gtk4::TreeView` |
| Tool count | 11 (out of 14 core tools) |

## 2. Dependencies

### Core GUI (`[dependencies]`)

| Dependency | Version | Purpose |
|---|---|---|
| `gdk4` | 0.11.0 (v4_6) | GDK 4 (windowing system abstraction) |
| `glib` | 0.22.0 | GLib bindings |
| `gtk4` | 0.11.0 (v4_6) | GTK 4 widget toolkit |
| `czkawka_core` | 11.0.1 (path) | Shared scanning engine (no features by default) |

### Utilities

| Dependency | Purpose |
|---|---|
| `humansize` | Binary file size formatting |
| `chrono` | Timestamp formatting |
| `crossbeam-channel` | Inter-thread communication (scan results, progress) |
| `directories-next` | Config/cache folder paths |
| `open` | Opening files/folders in system file manager |
| `image` | JPEG/PNG decoding for previews and SVG rasterization |
| `regex` | Custom selection regex matching |
| `fs_extra` | File/directory move operations |
| `rayon` | Parallel file deletion and sorting |
| `serde` / `serde_json` | JSON serialization of settings |
| `itertools` | Partitioning partition results |
| `rand` | Random temp file name generation (Windows hardlink test) |

### SVG → Pixbuf pipeline

- `resvg` (0.47.0) — renders SVG data to a pixmap via `tiny_skia`
- `image` — converts raw RGBA to PNG in-memory, loaded by GDK `Pixbuf`

### Internationalization

| Dependency | Purpose |
|---|---|
| `i18n-embed` (0.16) | Fluent-based localization loader |
| `i18n-embed-fl` (0.10) | Fluent macro support (`fl!`) |
| `rust-embed` (8.5) | Embeds `i18n/` directory at compile time |

### Platform-specific

| Target | Dependency | Purpose |
|---|---|---|
| `cfg(windows)` | `winapi` (0.3.9) | Windows taskbar progress via `ITaskbarList3` COM interface |

### Optional features (gate `czkawka_core` features)

- `heif` — HEIF/HEIC image support
- `libraw` — Raw camera format support
- `libavif` — AVIF image support
- `xdg_portal_trash` — Trash via xdg-portal (Flatpak)

## 3. Architecture & Module Map

```
src/
├── main.rs                    # Entry point, CLI arg handling, wire all callbacks
├── initialize_gui.rs          # Initial combo box models, scale ranges, progress window
├── compute_results.rs         # Process scan results via channel → populate ListStore
├── gtk_traits.rs              # ComboBoxTraits, DialogTraits, WidgetTraits
├── help_functions.rs          # Text view helpers, button visibility, path utilities
├── help_combo_box.rs          # Combo box data structs (hash types, check methods, etc.)
├── notebook_enums.rs          # NotebookMainEnum (11 tools), NotebookUpperEnum
├── notebook_info.rs           # NOTEBOOKS_INFO array: column layout per tool
├── opening_selecting_records.rs # Click/keyboard handlers for opening/selections
├── saving_loading.rs          # SettingsJson struct, JSON load/save/reset
├── localizer_gui.rs           # flg! macro definition
├── language_functions.rs      # LANGUAGES_ALL (27 languages), language lookup
├── taskbar_progress.rs        # Platform-conditional re-export
├── taskbar_progress_dummy.rs  # No-op TaskbarProgress (non-Windows)
├── taskbar_progress_win.rs    # Real Windows taskbar progress via COM
├── connect_things/            # 23 modules — one per callback group
├── gui_structs/               # 14 modules — GUI state structs
└── helpers/                   # 4 modules — enums, image ops, list store ops, model iter
```

### 3.1 Entry Point — [`main.rs`](czkawka_gui/src/main.rs:75)

The `main()` function:
1. Registers image decoding hooks (`register_image_decoding_hooks()`)
2. Sets config/cache path to `Czkawka/Czkawka`
3. Creates a GTK 4 `Application` with `HANDLES_OPEN | HANDLES_COMMAND_LINE` flags
4. On `connect_command_line`, parses CLI args via `process_cli_args()`, then calls `build_ui()`
5. `build_ui()` at line 115 creates `GuiData`, wires ALL callbacks, loads config, and shows the Krokiet info dialog if first run

The constant at line 73 defines the tool count:

```rust
pub const CZKAWKA_GTK_TOOL_NUMBER: usize = TOOLS_NUMBER - 3;
// Missing: exif_remover, video_optimizer, bad_names
```

### 3.2 GUI State — [`GuiData`](czkawka_gui/src/gui_structs/gui_data.rs:50)

`GuiData` is the central state container (`Clone`-able via `derive`). It holds:

| Field | Type | Source |
|---|---|---|
| `window_main` | `gtk4::Window` | `main_window.ui` |
| `main_notebook` | `GuiMainNotebook` | Tab container for 11 scanning tools |
| `upper_notebook` | `GuiUpperNotebook` | Directory selection, filters, size limits |
| `bottom_buttons` | `GuiBottomButtons` | Search/Select/Delete/Save/Symlink/Hardlink/Move/Compare/Sort |
| `progress_window` | `GuiProgressDialog` | Modal progress dialog |
| `settings` | `GuiSettings` | Settings window |
| `about` | `GuiAbout` | About dialog |
| `header` | `GuiHeader` | Settings & info buttons |
| `compare_images` | `GuiCompareImages` | Image comparison window |
| `popovers_select` | `GuiSelectPopovers` | Select popover menu |
| `popovers_sort` | `GuiSortPopovers` | Sort popover menu |
| `shared_buttons` | `HashMap<NotebookMainEnum, HashMap<BottomButtonsEnum, bool>>` | Per-tab button visibility |
| `stop_flag` | `Arc<AtomicBool>` | Shared cancellation flag |
| `taskbar_state` | `Rc<RefCell<TaskbarProgress>>` | Windows taskbar progress |

### 3.3 UI Loading Pattern

All UI files are loaded via the Cambalache XML format using `gtk4::Builder`:

```rust
let glade_src = include_str!("../../ui/main_window.ui").to_string();
let builder = Builder::from_string(glade_src.as_str());
let widget: gtk4::SomeWidget = builder.object("widget_name").expect("Cambalache");
```

Six `.ui` files are embedded:
- [`ui/main_window.ui`](czkawka_gui/ui/main_window.ui) — Main application window
- [`ui/settings.ui`](czkawka_gui/ui/settings.ui) — Settings dialog
- [`ui/progress.ui`](czkawka_gui/ui/progress.ui) — Progress dialog
- [`ui/about_dialog.ui`](czkawka_gui/ui/about_dialog.ui) — About dialog
- [`ui/compare_images.ui`](czkawka_gui/ui/compare_images.ui) — Image comparison window
- [`ui/popover_select.ui`](czkawka_gui/ui/popover_select.ui) — Selection popover
- [`ui/popover_sort.ui`](czkawka_gui/ui/popover_sort.ui) — Sort popover
- [`ui/popover_right_click.ui`](czkawka_gui/ui/popover_right_click.ui) — Right-click popover (unused)

A `.cmb` file ([`ui/czkawka.cmb`](czkawka_gui/ui/czkawka.cmb)) is also present — this is the Cambalache project file.

### 3.4 Callback Wiring — [`connect_things/`](czkawka_gui/src/connect_things/mod.rs)

23 modules, each connecting a specific set of GTK signals:

| Module | Lines | Purpose |
|---|---|---|
| `connect_about_buttons` | 47 | Opens sponsor/instruction/repository/translation/Krokiet URLs |
| `connect_button_compare` | 661 | Image comparison window — group navigation, image loading, click-to-select |
| `connect_button_delete` | 299 | File deletion with confirmation dialogs, trash support, parallel deletion |
| `connect_button_hardlink` | 328 | Hardlink/symlink creation with group validation |
| `connect_button_move` | 165 | File move via native folder chooser |
| `connect_button_save` | 61 | Save scan results via `PrintResults::save_all_in_one()` |
| `connect_button_search` | 743 | **Largest module** — spawns scan threads for all 11 tools |
| `connect_button_select` | 101 | Shows/hides select popover buttons based on tool capabilities |
| `connect_button_sort` | 145 | Sorts tree view groups by file name, folder name, size, selection |
| `connect_button_stop` | 34 | Sets `stop_flag = true` to cancel scanning |
| `connect_change_language` | 59 | Loads system language, switches language at runtime |
| `connect_duplicate_buttons` | 31 | Shows/hides hash type combo box based on duplicate check method |
| `connect_header_buttons` | 18 | Opens about dialog |
| `connect_krokiet_info_dialog` | 64 | Shows first-run Krokiet migration dialog |
| `connect_notebook_tabs` | 22 | Updates bottom buttons when switching tabs |
| `connect_popovers_select` | 819 | **Largest connect module** — select all/unselect/reverse/by date/by size/custom regex |
| `connect_popovers_sort` | 298 | Sort within groups by multiple criteria |
| `connect_progress_window` | 205 | Polls progress channel, updates progress bars and labels |
| `connect_same_music_mode_changed` | 82 | Shows/hides music comparison UI based on tag vs content mode |
| `connect_selection_of_directories` | 299 | Add/remove/DRAG-AND-DROP directory management |
| `connect_settings` | 254 | Save/load/reset config, clear cache, language, thread count |
| `connect_show_hide_ui` | 31 | Toggle error panel and upper notebook visibility |
| `connect_similar_image_size_change` | 32 | Adjust similarity scale range when hash size changes |

### 3.5 Scan Thread Pattern

In [`connect_button_search.rs`](czkawka_gui/src/connect_things/connect_button_search.rs:42), the search button's click handler:
1. Loads common settings from UI (`LoadedCommonItems` at line 129)
2. Clears the current tree view
3. Disables notebook/buttons, shows progress dialog
4. Spawns a dedicated OS thread (with `DEFAULT_THREAD_SIZE` stack) for the selected tool
5. The thread sends results via `crossbeam_channel::Sender<Message>` and progress via `Sender<ProgressData>`
6. Results are received in [`compute_results.rs`](czkawka_gui/src/compute_results.rs:90) via `glib::spawn_future_local` polling the channel

### 3.6 Result Display — [`compute_results.rs`](czkawka_gui/src/compute_results.rs)

Each tool variant (`Message::Duplicates`, `Message::EmptyFolders`, etc.) is handled by a dedicated `compute_*` function that:
- Checks `handle_stopped_search()` for cancellation
- Reads tool information (`get_information()`, `get_text_messages()`)
- Sets the entry info text with localized results count
- Populates the `gtk4::ListStore` via `append_row_to_list_store()`
- Sets selection behavior (headers vs non-headers)
- Stores the tool instance in `SharedModelEnum` for later save/export

### 3.7 Column Constants — [`helpers/enums.rs`](czkawka_gui/src/helpers/enums.rs)

Each tool has its own column enum defining the flat index-based column layout for the `ListStore`:

| Enum | Columns | Notes |
|---|---|---|
| `ColumnsDuplicates` (line 70) | 11 columns | ActivatableSelectButton, SelectionButton, Size, SizeAsBytes, Name, Path, Modification, ModificationAsSecs, Color, IsHeader, TextColor |
| `ColumnsEmptyFolders` | 5 columns | No header support |
| `ColumnsBigFiles` | 7 columns | Size as display + bytes |
| `ColumnsEmptyFiles` | 5 columns | Simple file list |
| `ColumnsTemporaryFiles` | 5 columns | Simple file list |
| `ColumnsSimilarImages` (line 138) | 13 columns | Similarity, Dimensions added |
| `ColumnsSimilarVideos` (line 155) | 16 columns | Fps, Codec, Bitrate, Dimensions, Duration |
| `ColumnsSameMusic` (line 175) | 18 columns | Title, Artist, Year, Bitrate, Length, Genre |
| `ColumnsInvalidSymlinks` | 7 columns | DestinationPath, TypeOfError |
| `ColumnsBrokenFiles` | 6 columns | ErrorType |
| `ColumnsBadExtensions` | 7 columns | CurrentExtension, ValidExtensions |

### 3.8 Notebook Info — [`notebook_info.rs`](czkawka_gui/src/notebook_info.rs)

The `NOTEBOOKS_INFO` static array (line 31) defines metadata for each of the 11 tool tabs: available popover modes, column types (GTK `Type`), bottom buttons, and tree view widget name. This drives dynamic UI configuration.

### 3.9 Combo Box Data — [`help_combo_box.rs`](czkawka_gui/src/help_combo_box.rs)

Defines constant arrays for dropdown options:

- `DUPLICATES_HASH_TYPE_COMBO_BOX` (line 10) — Blake3, CRC32, XXH3
- `DUPLICATES_CHECK_METHOD_COMBO_BOX` (line 30) — Hash, Size, Name, Size and Name
- `AUDIO_TYPE_CHECK_METHOD_COMBO_BOX` (line 56) — Tags, Content
- `BIG_FILES_CHECK_METHOD_COMBO_BOX` (line 74) — Biggest, Smallest
- `IMAGES_RESIZE_ALGORITHM_COMBO_BOX` (line 90) — Lanczos3, Nearest, Triangle, Gaussian, CatmullRom
- `IMAGES_HASH_TYPE_COMBO_BOX` (line 118) — Gradient, Mean, VertGradient, Blockhash, DoubleGradient, Median
- `IMAGES_HASH_SIZE_COMBO_BOX` (line 145) — 8, 16, 32, 64

### 3.10 Configuration — [`saving_loading.rs`](czkawka_gui/src/saving_loading.rs)

- Config file: `czkawka_gui_config.json` stored in the config folder
- `SettingsJson` struct (line 189) with 40+ fields, all with `#[serde(default)]` using dedicated default functions
- Settings persistence: save on close (if not using CLI args), load on start
- CLI arguments override loaded settings

### 3.11 Localization — [`localizer_gui.rs`](czkawka_gui/src/localizer_gui.rs)

The `flg!` macro (line 17) wraps `i18n_embed_fl::fl!()` with the Czkawka GUI language loader:

```rust
#[macro_export]
macro_rules! flg {
    ( $($tt:tt)* ) => {{
        i18n_embed_fl::fl!($crate::localizer_gui::LANGUAGE_LOADER_GUI, $($tt)*)
    }};
}
```

27 languages are supported (see [`language_functions.rs`](czkawka_gui/src/language_functions.rs:7)): en, fr, it, pl, ru, uk, ko, cs, de, ja, pt-PT, pt-BR, zh-CN, zh-TW, es-ES, no, sv-SE, ar, bg, el, nl, ro, tr, fa, hi, id, vi.

### 3.12 Taskbar Progress — [`taskbar_progress.rs`](czkawka_gui/src/taskbar_progress.rs)

Platform-conditional:
- **Windows** ([`taskbar_progress_win.rs`](czkawka_gui/src/taskbar_progress_win.rs)): Real implementation using `ITaskbarList3` COM interface via `winapi`. Supports all TBPFLAG states (NOPROGRESS, INDETERMINATE, NORMAL, ERROR, PAUSED).
- **Non-Windows** ([`taskbar_progress_dummy.rs`](czkawka_gui/src/taskbar_progress_dummy.rs)): No-op stub. All methods silently do nothing.

### 3.13 GTK Traits — [`gtk_traits.rs`](czkawka_gui/src/gtk_traits.rs)

Custom extension traits for GTK widgets:
- `ComboBoxTraits` (line 7) — `set_model_and_first()` for `ComboBoxText`
- `DialogTraits` (line 27) — `get_box_child()` for `Dialog`
- `WidgetTraits` (line 39) — Widget hierarchy traversal: `get_all_direct_children()`, `get_all_widgets_of_type()`, `get_widget_of_type()`, `get_all_boxes()`, `debug_print_widget()`

### 3.14 Helpers — [`helpers/`](czkawka_gui/src/helpers/)

- [`image_operations.rs`](czkawka_gui/src/helpers/image_operations.rs): SVG → `DynamicImage` → `Pixbuf` conversion, icon rendering (`set_icon_of_button()`), pixbuf resizing
- [`list_store_operations.rs`](czkawka_gui/src/helpers/list_store_operations.rs): `append_row_to_list_store()`, `clean_invalid_headers()`, `check_how_much_elements_is_selected()`, `count_number_of_groups()`, value lookup
- [`model_iter.rs`](czkawka_gui/src/helpers/model_iter.rs): Four iterator patterns over `ListStore`: simple (`iter_list`), breakable (`iter_list_with_break`), with init callback (`iter_list_with_break_init`, `iter_list_break_with_init`)

## 4. Icons

20 SVG icons + 1 PNG icon in [`icons/`](czkawka_gui/icons/):

| Icon | Uses |
|---|---|
| `czk_add.svg` | Add directory buttons |
| `czk_compare.svg` | Compare button |
| `czk_delete.svg` | Delete (remove) buttons |
| `czk_hardlink.svg` | Hardlink button |
| `czk_hide_down.svg` | Show errors button |
| `czk_hide_up.svg` | Show upper notebook button |
| `czk_info.svg` | About/info button |
| `czk_left.svg` | Previous compare group |
| `czk_manual_add.svg` | Manual add directory buttons |
| `czk_move.svg` | Move button |
| `czk_replace.svg` | Swap left/right images |
| `czk_right.svg` | Next compare group |
| `czk_save.svg` | Save button |
| `czk_search.svg` | Search button |
| `czk_select.svg` | Select popover button |
| `czk_settings.svg` | Settings button |
| `czk_sort.svg` | Sort popover button |
| `czk_stop.svg` | Stop button |
| `czk_symlink.svg` | Symlink button |
| `czk_trash.svg` | Delete button icon |
| `icon_about.png` | About dialog logo (PNG) |

Icons are rendered at 18×18px via the SVG→`DynamicImage`→`Pixbuf` pipeline in [`image_operations.rs`](czkawka_gui/src/helpers/image_operations.rs:57).

## 5. Differences from Krokiet

| Aspect | czkawka_gui | krokiet |
|---|---|---|
| **Framework** | GTK 4 (`gtk4-rs`) | Slint |
| **UI definition** | XML `.ui` (Cambalache/Glade) | `.slint` files |
| **Model** | `gtk4::ListStore` (flat) | `ModelRc<VecModel<SingleMainListModel>>` |
| **Tools** | 11 (excludes ExifRemover, VideoOptimizer, BadNames) | All 14 tools |
| **Callback wiring** | 23 separate `connect_*.rs` files | Fewer, grouped by feature |
| **Config persistence** | JSON file (`czkawka_gui_config.json`) | Settings system |
| **Image preview** | GTK `Picture` widget | Slint `Image` element |
| **Progress** | Modal dialog + Windows taskbar | Inline progress in UI |
| **File chooser** | Native `FileChooserNative` | Platform file picker |
| **Column types** | `ColumnsDuplicates` etc. (flat enum) | `StrDataDuplicates` (string/int arrays) |
| **Maintenance** | Bug-fixes only | Active development |
| **SVG icons** | 20 custom SVG icons | Uses icon theme |
| **Language switching** | Runtime via `i18n-embed` | Runtime via `i18n-embed` |
| **Async pattern** | `glib::spawn_future_local` + channel polling | Slint `invoke_from_event_loop` |
| **Threading** | OS threads (`std::thread`) | OS threads + `rayon` |
