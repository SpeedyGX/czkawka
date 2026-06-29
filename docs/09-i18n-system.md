# Czkawka — i18n / Localization System

This document documents the internationalization (i18n) system used across all four Czkawka
frontends. The system is based on the [Fluent](https://projectfluent.org/) localization framework
and the Rust [`i18n-embed`](https://crates.io/crates/i18n-embed) crate.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Crate-by-Crate Breakdown](#2-crate-by-crate-breakdown)
   - [krokiet (Slint Desktop GUI)](#krokiet-slint-desktop-gui)
   - [cedinia (Android/Mobile GUI)](#cedinia-androidmobile-gui)
   - [czkawka_core (Shared Library)](#czkawka_core-shared-library)
   - [czkawka_gui (Legacy GTK4 GUI)](#czkawka_gui-legacy-gtk4-gui)
3. [File Structure](#3-file-structure)
4. [Key Counts & Structure](#4-key-counts--structure)
5. [Available Languages](#5-available-languages)
6. [`i18n.toml` Configuration](#6-i18ntoml-configuration)
7. [How Fluent Is Loaded (Localizer Modules)](#7-how-fluent-is-loaded-localizer-modules)
   - [Standard Pattern](#standard-pattern)
   - [Rust Embedding](#rust-embedding)
   - [Language Loading and Selection](#language-loading-and-selection)
8. [The Fluent Macros](#8-the-fluent-macros)
   - [`flk!` (Krokiet)](#flk-krokiet)
   - [`flc!` (Cedinia)](#flc-cedinia)
   - [`flg!` (czkawka_gui)](#flg-czkawka_gui)
   - [`flc!` (czkawka_core)](#flc-czkawka_core)
9. [Placeholder Patterns](#9-placeholder-patterns)
10. [Editing Rules](#10-editing-rules)

---

## 1. Overview

The Czkawka project uses the **Fluent** localization system (`.ftl` files — "Fluent Translation
List"), embedded directly into each Rust binary at compile time via
[`rust-embed`](https://crates.io/crates/rust-embed).

Each crate that displays user-visible text has:
- An `i18n/` directory containing one subdirectory per language.
- An `i18n.toml` configuration file declaring `fallback_language = "en"` and the Fluent assets
  directory.
- A `localizer_*.rs` module that initializes the `FluentLanguageLoader`, embeds the `i18n/`
  folder, and exports a Fluent macro.

**Key design decisions:**
- English (`en`) is the **sole source/fallback language**. Only English `.ftl` files are edited
  directly in this repository.
- All other languages are managed through
  [Crowdin](https://crowdin.com/) and are pulled in as pre-translated `.ftl` files. Manual edits
  to non-English `.ftl` files will be **overwritten** on the next `just unpack_translations` run.
- Translation strings are **compiled into the binary** at build time — no runtime file loading.

---

## 2. Crate-by-Crate Breakdown

### krokiet (Slint Desktop GUI)

| Property | Value |
|----------|-------|
| FTL file | [`krokiet/i18n/en/krokiet.ftl`](krokiet/i18n/en/krokiet.ftl) |
| i18n config | [`krokiet/i18n.toml`](krokiet/i18n.toml) |
| Localizer module | [`krokiet/src/localizer_krokiet.rs`](krokiet/src/localizer_krokiet.rs) |
| Fluent macro | `flk!(...)` |
| Slint translation binding | [`krokiet/ui/translations.slint`](krokiet/ui/translations.slint) (property declarations) |
| Rust-Slint bridge | [`krokiet/src/connect_translation.rs`](krokiet/src/connect_translation.rs) |

The Krokiet GUI uses a **two-layer** translation system:
1. **Rust-side strings** (progress messages, error messages, scan results) are fetched via
   `flk!("key")` directly in Rust code.
2. **Slint-side strings** (UI labels, buttons, column headers) are declared as properties in
   `translations.slint` and populated by `connect_translation.rs` at startup using
   `set_<property_name>()` calls.

### cedinia (Android/Mobile GUI)

| Property | Value |
|----------|-------|
| FTL file | [`cedinia/i18n/en/cedinia.ftl`](cedinia/i18n/en/cedinia.ftl) |
| i18n config | [`cedinia/i18n.toml`](cedinia/i18n.toml) |
| Localizer module | [`cedinia/src/localizer_cedinia.rs`](cedinia/src/localizer_cedinia.rs) |
| Fluent macro | `flc!(...)` |
| Translation bridge | [`cedinia/src/translations.rs`](cedinia/src/translations.rs) |

Cedinia supports **runtime language switching** via [`apply_language_preference()`](cedinia/src/localizer_cedinia.rs:72).
It also has an OS language auto-detection function
[`detect_os_language_idx()`](cedinia/src/localizer_cedinia.rs:56) that uses
`DesktopLanguageRequester::requested_languages()`.

The [`LANGUAGE_LIST`](cedinia/src/localizer_cedinia.rs:26) constant defines 27 supported languages
as `(&str, &str)` tuples (code, display name).

### czkawka_core (Shared Library)

| Property | Value |
|----------|-------|
| FTL file | [`czkawka_core/i18n/en/czkawka_core.ftl`](czkawka_core/i18n/en/czkawka_core.ftl) |
| i18n config | [`czkawka_core/i18n.toml`](czkawka_core/i18n.toml) |
| Localizer module | [`czkawka_core/src/localizer_core.rs`](czkawka_core/src/localizer_core.rs) |
| Fluent macro | `flc!(...)` (same name as cedinia's but in a different crate) |

Core has a smaller set of strings — mostly error messages, similarity labels, and path-related
messages that are shared across all frontends. It also exports helpers like
[`generate_translation_hashmap()`](czkawka_core/src/localizer_core.rs:30) for building
name-to-value lookup maps and
[`fnc_get_similarity_very_high()`](czkawka_core/src/localizer_core.rs:38) /
[`fnc_get_similarity_minimal()`](czkawka_core/src/localizer_core.rs:42) functions.

### czkawka_gui (Legacy GTK4 GUI)

| Property | Value |
|----------|-------|
| FTL file | [`czkawka_gui/i18n/en/czkawka_gui.ftl`](czkawka_gui/i18n/en/czkawka_gui.ftl) |
| i18n config | [`czkawka_gui/i18n.toml`](czkawka_gui/i18n.toml) |
| Localizer module | [`czkawka_gui/src/localizer_gui.rs`](czkawka_gui/src/localizer_gui.rs) |
| Fluent macro | `flg!(...)` |
| Language listing | [`czkawka_gui/src/language_functions.rs`](czkawka_gui/src/language_functions.rs) |

The GTK GUI has the largest FTL file, with many verbose tooltip strings. It defines a
[`LANGUAGES_ALL`](czkawka_gui/src/language_functions.rs:7) constant with 27 languages, each with a
`combo_box_text` display name and a `short_text` language code.

---

## 3. File Structure

```
<project>/
├── i18n.toml                          # Fluent configuration
├── i18n/
│   ├── en/
│   │   └── <project>.ftl              # English (source/fallback)
│   ├── pl/
│   │   └── <project>.ftl              # Polish translation
│   ├── fr/
│   │   └── <project>.ftl              # French translation
│   ├── de/
│   │   └── <project>.ftl              # German translation
│   └── ... (20+ language directories)
```

The `i18n.toml` file uses the `i18n-embed` convention:
```toml
fallback_language = "en"

[fluent]
assets_dir = "i18n"
```

The `assets_dir` path is relative to the crate root. The `i18n-embed` build script reads this
config to know which directory to embed.

---

## 4. Key Counts & Structure

### krokiet.ftl ([krokiet/i18n/en/krokiet.ftl](krokiet/i18n/en/krokiet.ftl))
- **~500 keys** across 502 lines
- Sections:
  - **Rust translations** (lines 1–138): scan progress, results summaries, cache operations,
    deletion confirmations, error messages — all used via `flk!("rust_*")`.
  - **Slint array translations** (lines 140–169): column header names (e.g. `column_selection`,
    `column_source`, `column_size`).
  - **Slint UI translations** (lines 171–501): button labels, settings labels, dropdown options,
    confirmation dialogs, context menu items, comparison view strings.
- Key naming convention: `snake_case` with prefixes like `rust_`, `column_`, `settings_`,
  `subsettings_`, `option_`, `selection_`, `compare_`, `context_menu_`, `popup_`, `optimize_`,
  `hardlink_`, `softlink_`, `clean_`, `crop_`, `reencode_`.

### cedinia.ftl ([cedinia/i18n/en/cedinia.ftl](cedinia/i18n/en/cedinia.ftl))
- **~361 keys** across 361 lines
- Sections:
  - App/tool names, home screen descriptions, results list labels, selection popup, delete errors,
    permission popup, settings (General, Tools, Diagnostics tabs), directories screen, bottom
    navigation, status messages, gallery, notifications, confirm popups, scan stages, group
    headers, combo-box options, volume labels, compare view.
- Key naming convention: `snake_case` with prefixes like `home_`, `settings_`, `diagnostics_`,
  `directories_`, `nav_`, `stage_`, `option_`, `volume_`, `compare_`.

### czkawka_core.ftl ([czkawka_core/i18n/en/czkawka_core.ftl](czkawka_core/i18n/en/czkawka_core.ftl))
- **~110 keys** across 110 lines
- Focus: Error messages, path validation warnings, FFmpeg errors, cache I/O errors, similarity
  labels.
- Key naming convention: All keys prefixed with `core_`.

### czkawka_gui.ftl ([czkawka_gui/i18n/en/czkawka_gui.ftl](czkawka_gui/i18n/en/czkawka_gui.ftl))
- **~610 keys** across 610 lines
- The largest FTL file. Contains extensive tooltip texts, settings explanations, compute result
  messages.
- Sections: Window titles, general buttons, music settings, duplicate check methods, image hash
  explanations, tree view columns, upper/included/excluded paths, popovers, bottom buttons,
  progress window, about window, settings (General, Duplicates, Images, Videos),
  saving/loading, cache, preview, image comparison.
- Key naming convention: `snake_case` with sections like `music_`, `duplicate_`, `image_`,
  `bottom_`, `upper_`, `popover_`, `settings_`, `compute_`, `progress_`, `saving_loading_`,
  `cache_`.

---

## 5. Available Languages

All four crates support the same **27 languages** (26 translated + English as source):

| Code   | Language                | Code   | Language                |
|--------|-------------------------|--------|-------------------------|
| `ar`   | Arabic                  | `bg`   | Bulgarian               |
| `cs`   | Czech                   | `de`   | German                  |
| `el`   | Greek                   | `en`   | English (source)        |
| `es-ES`| Spanish                 | `fa`   | Persian                 |
| `fr`   | French                  | `hi`   | Hindi                   |
| `id`   | Indonesian              | `it`   | Italian                 |
| `ja`   | Japanese                | `ko`   | Korean                  |
| `nl`   | Dutch                   | `no`   | Norwegian               |
| `pl`   | Polish                  | `pt-BR`| Brazilian Portuguese    |
| `pt-PT`| Portuguese              | `ro`   | Romanian                |
| `ru`   | Russian                 | `sv-SE`| Swedish                 |
| `tr`   | Turkish                 | `uk`   | Ukrainian               |
| `vi`   | Vietnamese              | `zh-CN`| Simplified Chinese      |
| `zh-TW`| Traditional Chinese     |        |                         |

Each crate has an `i18n/<code>/<project>.ftl` file for every language listed above. All 27
directories exist under:
- [`krokiet/i18n/`](krokiet/i18n/)
- [`cedinia/i18n/`](cedinia/i18n/)
- [`czkawka_core/i18n/`](czkawka_core/i18n/)
- [`czkawka_gui/i18n/`](czkawka_gui/i18n/)

---

## 6. `i18n.toml` Configuration

Every crate has an identical [`i18n.toml`](krokiet/i18n.toml):

```toml
# (Required) The language identifier of the language used in the
# source code for gettext system, and the primary fallback language
# (for which all strings must be present) when using the fluent
# system.
fallback_language = "en"

# Use the fluent localization system.
[fluent]
# (Required) The path to the assets directory.
# The paths inside the assets directory should be structured like so:
# `assets_dir/{language}/{domain}.ftl`
assets_dir = "i18n"
```

The `fallback_language` is the language used when a requested translation key is missing in the
selected language. The `assets_dir` is relative to the crate's `Cargo.toml`.

The `i18n-embed` crate uses this configuration at build time to determine which directory to
embed into the binary via `rust-embed`.

---

## 7. How Fluent Is Loaded (Localizer Modules)

### Standard Pattern

All four crates follow the same pattern ([example from `localizer_krokiet.rs`](krokiet/src/localizer_krokiet.rs)):

```rust
use i18n_embed::fluent::{FluentLanguageLoader, fluent_language_loader};
use i18n_embed::{DefaultLocalizer, LanguageLoader, Localizer};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "i18n/"]
struct Localizations;

pub static LANGUAGE_LOADER_KROKIET: std::sync::LazyLock<FluentLanguageLoader> =
    std::sync::LazyLock::new(|| {
        let loader: FluentLanguageLoader = fluent_language_loader!();
        loader
            .load_fallback_language(&Localizations)
            .expect("Error while loading fallback language");
        loader
    });

#[macro_export]
macro_rules! flk {
    ( $($tt:tt)* ) => {{
        i18n_embed_fl::fl!($crate::localizer_krokiet::LANGUAGE_LOADER_KROKIET, $($tt)*)
    }};
}

pub(crate) fn localizer_krokiet() -> Box<dyn Localizer> {
    Box::from(DefaultLocalizer::new(&*LANGUAGE_LOADER_KROKIET, &Localizations))
}
```

### Rust Embedding

The `#[derive(RustEmbed)]` with `#[folder = "i18n/"]` causes the entire `i18n/` directory
(including all language subdirectories and all `.ftl` files) to be **compiled into the binary** as
read-only data. At runtime, the `FluentLanguageLoader` reads from this embedded data, not from the
filesystem.

This means:
- No deployment of language files alongside the binary.
- No runtime I/O for loading translations.
- The binary grows by the total size of all `.ftl` files.

### Language Loading and Selection

1. **At startup**, `loader.load_fallback_language(&Localizations)` loads the English `.ftl` file
   as the fallback.
2. The `FluentLanguageLoader` is stored in a `LazyLock` static, initialized once.
3. To switch languages at runtime (Cedinia), the
   [`apply_language_preference()`](cedinia/src/localizer_cedinia.rs:72) function calls
   `localizer.select(&[lang_id])` with a parsed `LanguageIdentifier`.
4. For the Slint-based GUIs (Krokiet), the language is set by repopulating the
   `translations.slint` properties in [`connect_translation.rs`](krokiet/src/connect_translation.rs)
   after changing the language.

### Special: czkawka_gui GTK4

The GTK4 GUI ([`localizer_gui.rs`](czkawka_gui/src/localizer_gui.rs)) follows the same pattern
but uses `flg!` instead of `flk!`. Language selection is handled via the GTK combo box defined in
[`language_functions.rs`](czkawka_gui/src/language_functions.rs), which maps display names to
language codes.

---

## 8. The Fluent Macros

### `flk!` (Krokiet)

Defined in [`krokiet/src/localizer_krokiet.rs:17`](krokiet/src/localizer_krokiet.rs:17).

```rust
flk!("rust_scanning_file", entries_checked = count)
flk!("main_window_title")
```

- Prefix: `flk` = "Fluent **K**rokiet"
- Uses `LANGUAGE_LOADER_KROKIET`
- Available across the entire `krokiet` crate via `#[macro_export]`

### `flc!` (Cedinia)

Defined in [`cedinia/src/localizer_cedinia.rs:16`](cedinia/src/localizer_cedinia.rs:16).

```rust
flc!("app_name")
flc!("scan_completed_notification", file_count = count)
```

- Prefix: `flc` = "Fluent **C**edinia"
- Uses `LANGUAGE_LOADER_CEDINIA`
- NOTE: The same `flc!` name is also used by `czkawka_core`, but they are different macros in
  different crates and do not conflict since each crate compiles independently.

### `flg!` (czkawka_gui)

Defined in [`czkawka_gui/src/localizer_gui.rs:17`](czkawka_gui/src/localizer_gui.rs:17).

```rust
flg!("window_main_title")
flg!("compute_found_duplicates_hash_size", number_files = n, number_groups = g, size = s, time = t)
```

- Prefix: `flg` = "Fluent **G**TK GUI"
- Uses `LANGUAGE_LOADER_GUI`

### `flc!` (czkawka_core)

Defined in [`czkawka_core/src/localizer_core.rs:20`](czkawka_core/src/localizer_core.rs:20).

```rust
flc!("core_similarity_very_high")
flc!("core_cannot_open_dir", dir = path, reason = err)
```

- Same macro name as cedinia's (`flc!`) but in a different crate.
- Uses `LANGUAGE_LOADER_CORE`.

---

## 9. Placeholder Patterns

Fluent placeholders are used extensively across all FTL files. The syntax is:

```
key_name = Some text with { $placeholder } and more { $other }
```

Common placeholder patterns:

| Pattern | Example | Used in |
|---------|---------|---------|
| Single count | `{ $items_found }` | Scan result summaries |
| Dual counts | `{ $items_found } in { $groups } groups` | Grouped results |
| Size + count | `{ $items_found } taking { $size }` | Size-aware results |
| Path + reason | `{ $file }, reason: { $reason }` | Error messages |
| Time | `in { $time }` | Duration display |
| File paths | `"{ $file }"` | Operation messages |
| Numbers | `{ $number_files }` | Compute results |
| Error detail | `{ $error }`, `{ $reason }` | Error reporting |

---

## 10. Editing Rules

Based on the project's [`AGENTS.md`](AGENTS.md):

1. **Only edit English `.ftl` files** (`i18n/en/<project>.ftl`) directly in this repository.
2. All other language files are managed through
   [Crowdin](https://crowdin.com/) and will be **overwritten** when translations are pulled from
   Crowdin.
3. Manual edits to non-English `.ftl` files in the repo will be **lost** on the next
   `just unpack_translations` run.
4. After adding new English keys, run `python3 misc/ai_translate/translate.py <i18n_folder>` to
   batch-translate missing keys into all supported languages.
5. Run `python3 misc/ai_translate/validate_translations.py <i18n_folder> --fix` to validate
   placeholder consistency and trailing-dot matching across all translations.
6. All user-visible strings **must** go through the Fluent system — no hardcoded strings in UI
   code.
