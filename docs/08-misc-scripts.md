# Czkawka — misc/ Scripts, ci_tester, and Infrastructure

This document documents every script and helper in the [`misc/`](misc/) directory, the
[`ci_tester/`](ci_tester/) project, and supporting infrastructure files such as Docker, Nix, and
Cargo publish helpers.

---

## Table of Contents

1. [AI Translation Pipeline](#1-ai-translation-pipeline)
   - [`ftl_utils.py`](misc/ai_translate/ftl_utils.py)
   - [`translate.py`](misc/ai_translate/translate.py)
   - [`validate_translations.py`](misc/ai_translate/validate_translations.py)
   - [`pyproject.toml`](misc/pyproject.toml)
2. [Lint / Quality Scripts (run_checks.sh pipeline)](#2-lint--quality-scripts-run_checkssh-pipeline)
   - [`delete_unused_krokiet_slint_imports.py`](misc/delete_unused_krokiet_slint_imports.py)
   - [`find_unused_fluent_translations.py`](misc/find_unused_fluent_translations.py)
   - [`find_unused_slint_translations.py`](misc/find_unused_slint_translations.py)
   - [`find_unused_callbacks.py`](misc/find_unused_callbacks.py)
   - [`find_unused_settings_properties.py`](misc/find_unused_settings_properties.py)
   - [`run_checks.sh`](misc/run_checks.sh)
3. [Build / Packaging Scripts](#3-build--packaging-scripts)
   - [`compare_files.sh`](misc/compare_files.sh)
   - [`flathub.sh`](misc/flathub.sh)
   - [`gen_android_icons.py`](misc/gen_android_icons.py)
   - [`gen_cedinia_licenses.py`](misc/gen_cedinia_licenses.py)
   - [`pack_all_backends.sh` & `pack_all_backends.ps1`](misc/pack_all_backends.sh)
   - [`remove_comments.py`](misc/remove_comments.py)
4. [Cargo Publish Scripts](#4-cargo-publish-scripts)
   - [`PublishCore.sh`](misc/cargo/PublishCore.sh)
   - [`PublishOther.sh`](misc/cargo/PublishOther.sh)
5. [Docker](#5-docker)
6. [Nix Flake](#6-nix-flake)
7. [add_icon_exe](#7-add_icon_exe)
8. [ci_tester](#8-ci_tester)

---

## 1. AI Translation Pipeline

Three Python scripts in [`misc/ai_translate/`](misc/ai_translate/) form the AI-powered batch
translation system. The pipeline uses the [Ollama](https://ollama.com/) CLI to invoke a local LLM
for translating Fluent (`.ftl`) files.

### `ftl_utils.py` ([misc/ai_translate/ftl_utils.py](misc/ai_translate/ftl_utils.py))

Shared utility module used by both [`translate.py`](misc/ai_translate/translate.py) and
[`validate_translations.py`](misc/ai_translate/validate_translations.py).

**`LANGUAGE_NAMES`** ([misc/ai_translate/ftl_utils.py:8](misc/ai_translate/ftl_utils.py:8)) — a
dictionary mapping 24 language codes to human-readable names:

| Code   | Name                  | Code   | Name                  |
|--------|-----------------------|--------|-----------------------|
| `ar`   | Arabic                | `bg`   | Bulgarian             |
| `cs`   | Czech                 | `de`   | German                |
| `el`   | Greek                 | `en`   | English               |
| `es-ES`| Spanish               | `fa`   | Persian               |
| `fr`   | French                | `it`   | Italian               |
| `ja`   | Japanese              | `ko`   | Korean                |
| `nl`   | Dutch                 | `no`   | Norwegian             |
| `pl`   | Polish                | `pt-BR`| Brazilian Portuguese  |
| `pt-PT`| Portuguese            | `ro`   | Romanian              |
| `ru`   | Russian               | `sv-SE`| Swedish               |
| `tr`   | Turkish               | `uk`   | Ukrainian             |
| `zh-CN`| Simplified Chinese    | `zh-TW`| Traditional Chinese   |

**`parse_ftl_file()`** ([misc/ai_translate/ftl_utils.py:36](misc/ai_translate/ftl_utils.py:36)) —
Parses a `.ftl` file into a `Dict[str, str]`. Handles multi-line values (continuation lines
starting with a space), blank-line separators inside multi-line values, and skips comment lines
(`#`).

**`find_ftl_file_in_folder()`** ([misc/ai_translate/ftl_utils.py:97](misc/ai_translate/ftl_utils.py:97)) —
Expects exactly one `.ftl` file per language folder. Warns if multiple are found and returns the
first.

### `translate.py` ([misc/ai_translate/translate.py](misc/ai_translate/translate.py))

The main batch translation script.

**Default model:** `"translategemma:12b"` ([misc/ai_translate/translate.py:13](misc/ai_translate/translate.py:13)).
Other models tested (commented out): `qwen2.5:7b`, `qwen2.5:32b`, `zongwei/gemma3-translator:4b`.

**`IGNORED_KEYS`** ([misc/ai_translate/translate.py:15](misc/ai_translate/translate.py:15)) —
A list of keys skipped during translation (e.g. `"bottom_symlink_button"`,
`"general_ok_button"`, `"ref"`).

**Workflow:**

1. **`main()`** ([misc/ai_translate/translate.py:289](misc/ai_translate/translate.py:289)) —
   CLI entry point. Accepts an `i18n_folder` path, optional `--model`, `--dry-run`, and
   `--languages` filters.
2. **`process_i18n_folder()`** ([misc/ai_translate/translate.py:183](misc/ai_translate/translate.py:183)) —
   Two-phase process:
   - **Analysis phase:** Reads the English base file, iterates over all (or selected) language
     folders, calls [`analyze_language_file()`](misc/ai_translate/translate.py:90) to find
     missing or untranslated keys.
   - **Translation phase:** For each missing key, calls
     [`translate_text()`](misc/ai_translate/translate.py:55) which invokes the Ollama API with a
     prompt asking for translation while preserving formatting and placeholders.
   - Calls [`update_language_file_content()`](misc/ai_translate/translate.py:117) to write
     translations back into the `.ftl` file, replacing existing values in-place or appending new
     keys.

**Translation prompt** ([misc/ai_translate/translate.py:66](misc/ai_translate/translate.py:66)):
`"Translate the following text to {language_name}. Keep the same tone and style. Preserve any
special formatting or placeholders. Only return the translated text, no explanations or additional
text."`

**Usage examples** (from argparse epilog):
```bash
python3 misc/ai_translate/translate.py czkawka_gui/i18n
python3 misc/ai_translate/translate.py krokiet/i18n --model qwen2.5:7b
python3 misc/ai_translate/translate.py czkawka_gui/i18n --dry-run
python3 misc/ai_translate/translate.py czkawka_gui/i18n --languages pl de fr
```

### `validate_translations.py` ([misc/ai_translate/validate_translations.py](misc/ai_translate/validate_translations.py))

Validates translated `.ftl` files for placeholder consistency and trailing-dot matching.

**Validation checks** ([`validate_translation()`](misc/ai_translate/validate_translations.py:40)):
1. **Missing placeholders** — placeholders present in the English source but missing in the
   translation.
2. **Extra placeholders** — placeholders in the translation not present in the English source.
3. **Wrong occurrence count** — a placeholder appears a different number of times.
4. **Trailing dot mismatch** — the translation ends with `.` when the source does not, or vice
   versa.

**`--fix` mode** ([misc/ai_translate/validate_translations.py:299](misc/ai_translate/validate_translations.py:299)):
- Entries with **placeholder errors** are **removed** entirely from the translated file via
  [`fix_language_file()`](misc/ai_translate/validate_translations.py:105).
- Entries with **trailing-dot mismatches** are **corrected** in-place via
  [`fix_trailing_dots_in_language_file()`](misc/ai_translate/validate_translations.py:142).

**Usage:**
```bash
python3 misc/ai_translate/validate_translations.py czkawka_gui/i18n
python3 misc/ai_translate/validate_translations.py krokiet/i18n
python3 misc/ai_translate/validate_translations.py krokiet/i18n --fix
```

### `pyproject.toml` ([misc/pyproject.toml](misc/pyproject.toml))

Python project configuration. **Requires Python 3.13 exactly.**

Dependencies:
- `ruff==0.15.8` — Python linter/formatter
- `mypy==1.19.1` — static type checker
- `ty==0.0.26` — CLI argument type-checking
- `pandas-stubs` — type stubs for pandas (used elsewhere)
- `fluent.syntax` — Fluent file parsing library
- `ollama` — Ollama HTTP client for AI translation

---

## 2. Lint / Quality Scripts (run_checks.sh pipeline)

These scripts are called by [`misc/run_checks.sh`](misc/run_checks.sh), which in turn is invoked
by `just fix`. They enforce code quality and dead-code-detection rules for the Slint-based GUIs
(Krokiet and Cedinia).

### `run_checks.sh` ([misc/run_checks.sh](misc/run_checks.sh))

Orchestrates all 12 checks in sequence. Any failure in any step causes the entire script to exit
with code 1. Full list of commands:

| # | Command | Purpose |
|---|---------|---------|
| 1 | `delete_unused_krokiet_slint_imports.py krokiet` | Clean Slint imports (Krokiet) |
| 2 | `delete_unused_krokiet_slint_imports.py cedinia` | Clean Slint imports (Cedinia) |
| 3 | `find_unused_fluent_translations.py czkawka_gui` | Unused FTL keys (GTK GUI) |
| 4 | `find_unused_fluent_translations.py krokiet` | Unused FTL keys (Krokiet) |
| 5 | `find_unused_fluent_translations.py cedinia` | Unused FTL keys (Cedinia) |
| 6 | `find_unused_fluent_translations.py czkawka_core` | Unused FTL keys (Core) |
| 7 | `find_unused_slint_translations.py krokiet` | Unused Slint translation properties (Krokiet) |
| 8 | `find_unused_slint_translations.py cedinia` | Unused Slint translation properties (Cedinia) |
| 9 | `find_unused_callbacks.py krokiet` | Unused/duplicated callbacks (Krokiet) |
| 10 | `find_unused_callbacks.py cedinia cedinia/ui/app_state.slint` | Unused/duplicated callbacks (Cedinia) |
| 11 | `find_unused_settings_properties.py krokiet` | Unused settings properties (Krokiet) |
| 12 | `find_unused_settings_properties.py cedinia` | Unused settings properties (Cedinia) |

### `delete_unused_krokiet_slint_imports.py` ([misc/delete_unused_krokiet_slint_imports.py](misc/delete_unused_krokiet_slint_imports.py))

**Purpose:** Removes unused `import { ... } from "..."` statements from `.slint` files in Krokiet
or Cedinia.

**How it works:**
1. Walks `<folder>/ui/` for all `.slint` files.
2. Separates each file into "import lines" and "non-import content."
3. For each import, extracts the imported items (inside `{ }`) and checks via regex whether each
   item is actually referenced in the non-import content.
4. Rewrites each import line with only the used items, sorted alphabetically.
5. Drops import lines that become empty.

**Usage:** `python misc/delete_unused_krokiet_slint_imports.py krokiet`

### `find_unused_fluent_translations.py` ([misc/find_unused_fluent_translations.py](misc/find_unused_fluent_translations.py))

**Purpose:** Finds Fluent translation keys defined in the English `.ftl` file that are never
referenced by string literal in any Rust source file.

**How it works:**
1. Collects all `.rs` files in the given project folder.
2. Finds the English `.ftl` file (path matching `/en/<project>.ftl`).
3. Extracts all keys (lines containing `=`).
4. For each key, checks if the string `"keyname"` appears anywhere in the Rust source.
5. Keys starting with `option_` are **always** skipped (they are used dynamically).

**Exits with code 1** if any unused keys are found.

**Usage:** `python misc/find_unused_fluent_translations.py krokiet`

### `find_unused_slint_translations.py` ([misc/find_unused_slint_translations.py](misc/find_unused_slint_translations.py))

**Purpose:** Validates that all translation properties declared in `ui/translations.slint` are
either used in other `.slint` files or set from Rust code.

**How it works:**
1. Reads `translations.slint` and extracts all `property` declarations.
2. Scans all **other** `.slint` files for `Translations.<property>` references.
3. Scans the Rust translation file (`connect_translation.rs` or `translations.rs`) for
   `set_<property>(` calls.
4. Reports properties that are neither used in Slint **nor** set from Rust (dead weight).

**Usage:** `python misc/find_unused_slint_translations.py krokiet`

### `find_unused_callbacks.py` ([misc/find_unused_callbacks.py](misc/find_unused_callbacks.py))

**Purpose:** Ensures every `callback` declared in a `callabler.slint` file has exactly one
`.on_<callback>(` implementation in Rust.

**How it works:**
1. Extracts all callback names from `ui/callabler.slint` (or a custom path) via regex
   `callback\s+(\w+)\s*\(`.
2. Searches all `.rs` files under `<folder>/src/` for `.on_<callback>(`.
3. Errors if a callback has **zero** or **more than one** implementation (except a small
   allow-list of platform-specific callbacks: `open_path`, `open_parent_folder`, `open_url`,
   `request_storage_permission`).
4. A hard-coded exclusion list: `["theme_changed"]` — this callback is executed from Slint
   directly and does not need a Rust handler.

**Usage:** `python misc/find_unused_callbacks.py krokiet`

### `find_unused_settings_properties.py` ([misc/find_unused_settings_properties.py](misc/find_unused_settings_properties.py))

**Purpose:** Checks that every property declared in `ui/settings.slint` has both a `.get_<name>(`
and `.set_<name>(` call in Rust code.

**How it works:**
1. Parses `settings.slint` for `in-out property <type> <name>:` definitions.
2. Scans all `.rs` files under `<folder>/src/` for getter and setter invocations.
3. Reports properties missing getters, missing setters, or both.

**Usage:** `python misc/find_unused_settings_properties.py krokiet`

---

## 3. Build / Packaging Scripts

### `compare_files.sh` ([misc/compare_files.sh](misc/compare_files.sh))

**Purpose:** Compares two builds of the CLI, GUI, and Krokiet binaries to verify deterministic
builds. Computes MD5 hashes of build artifacts (named with `_1` and `_2` suffixes) and asserts
they are identical for both debug and release profiles. Exits with code 1 if they differ.

### `flathub.sh` ([misc/flathub.sh](misc/flathub.sh))

**Purpose:** Generates Flatpak build metadata for Flathub publishing.

**Steps:**
1. Creates a Python 3.11 virtual environment via `uv`.
2. Installs `aiohttp`, `toml`, `tomlkit`.
3. Downloads `flatpak-cargo-generator.py` from the Flatpak builders-tools repository.
4. Runs it against `Cargo.lock` to produce `flatpak/cargo-sources.json`.

### `gen_android_icons.py` ([misc/gen_android_icons.py](misc/gen_android_icons.py))

**Purpose:** Generates Android launcher icon PNGs at all required densities from an SVG source.

**Input SVG:** `cedinia/icons/logo.svg` (default) or a custom path as CLI argument.

**Outputs** (written under `cedinia/res/`):

| Path | Size |
|------|------|
| `mipmap-mdpi/ic_launcher.png` | 48×48 px |
| `mipmap-hdpi/ic_launcher.png` | 72×72 px |
| `mipmap-xhdpi/ic_launcher.png` | 96×96 px |
| `mipmap-xxhdpi/ic_launcher.png` | 144×144 px |
| `mipmap-xxxhdpi/ic_launcher.png` | 192×192 px |
| `drawable-nodpi/ic_launcher_fg_src.png` | 432×432 px (adaptive icon foreground) |
| `drawable/ic_launcher_foreground.xml` | Bitmap wrapper XML |

**Renderer:** Tries `cairosvg` first; falls back to `inkscape` (supports both `--export-filename`
and legacy `--export-png` flags).

**Usage:** `python misc/gen_android_icons.py`

### `gen_cedinia_licenses.py` ([misc/gen_cedinia_licenses.py](misc/gen_cedinia_licenses.py))

**Purpose:** Generates `THIRD_PARTY_LICENSES.txt` for Cedinia by reading `cargo metadata` JSON.

**How it works:**
1. Reads `cargo metadata` from stdin.
2. Finds the `cedinia` package by name.
3. Performs a BFS through the dependency resolution graph to collect all transitive dependencies
   of Cedinia (excluding Cedinia itself).
4. Outputs lines in the format: `name version  [SPDX]  — authors\n    repository`

**Usage:** `cargo metadata --format-version 1 | python3 misc/gen_cedinia_licenses.py`

### `pack_all_backends.sh` / `pack_all_backends.ps1` ([misc/pack_all_backends.sh](misc/pack_all_backends.sh), [misc/pack_all_backends.ps1](misc/pack_all_backends.ps1))

**Purpose:** Packages a single "all-backends" Krokiet binary together with per-backend launcher
scripts into a zip archive.

**Shell version** — Creates shell scripts that set `SLINT_BACKEND` before running the binary.
Five backends:
- `winit-femtovg`
- `winit-skia-opengl`
- `winit-skia-vulkan`
- `winit-software`
- `femtovg-wgpu`

**PowerShell version** — Same concept but generates `.bat` files for Windows.

**Usage:** `misc/pack_all_backends.sh <binary> <output_zip>`

### `remove_comments.py` ([misc/remove_comments.py](misc/remove_comments.py))

**Purpose:** Removes all comments (`//` line comments and `/* */` block comments) from Rust source
files. Handles:
- Nested block comments and raw string literals (`r#"..."#`, `br#"..."#`).
- Preserves line counts by replacing removed lines with blank lines (if trailing newline present).

**Usage:** `python misc/remove_comments.py <target_directory>`

---

## 4. Cargo Publish Scripts

### `PublishCore.sh` ([misc/cargo/PublishCore.sh](misc/cargo/PublishCore.sh))

**Purpose:** Publishes `czkawka_core` to crates.io.

**Workflow:**
1. Configures `NUMBER` ("11.0.1") and `CZKAWKA_PATH`.
2. Clones the repository, checks out the tag.
3. Runs `cargo package` and `cargo publish` for `czkawka_core`.
4. Runs `git reset --hard` after each step.

### `PublishOther.sh` ([misc/cargo/PublishOther.sh](misc/cargo/PublishOther.sh))

**Purpose:** Publishes `czkawka_cli`, `czkawka_gui`, and `krokiet` to crates.io.

**Workflow:**
1. Same clone-and-checkout pattern as `PublishCore.sh`.
2. Runs `cargo package` for all three crates first (to validate).
3. Then runs `cargo publish` for each crate in sequence:
   - `czkawka_cli`
   - `czkawka_gui`
   - `krokiet`

---

## 5. Docker

### `Dockerfile` ([misc/docker/Dockerfile](misc/docker/Dockerfile))

**Purpose:** Provides a reproducible Ubuntu 22.04 build environment for Czkawka.

**Installed packages:**
- `curl` — for Rust toolchain installation
- `build-essential` — C compiler toolchain
- `libgtk-4-dev` — GTK4 development headers

**Rust:** Installed via `rustup` (latest stable). Simple verification: `cargo --version`.

---

## 6. Nix Flake

Two files provide Nix-based builds:

### `flake.nix` ([misc/nix/flake.nix](misc/nix/flake.nix))

Nix flake using `nixpkgs` (nixos-25.11-small), `rust-overlay`, `flake-utils`, and `crane`.

**MSRV:** Read dynamically from `czkawka_core/Cargo.toml`'s `package.rust-version` field.

**System build inputs:** `atk`, `cairo`, `gdk-pixbuf`, `glib`, `gtk4`, `pango`.

**Native build inputs:** `pkg-config`, `gobject-introspection`, `gsettings-desktop-schemas`,
`wrapGAppsHook4`.

### `packages.nix` ([misc/nix/packages.nix](misc/nix/packages.nix))

Defines three packages:
- **`czkawka-gui`** — Standard GTK4 GUI build via Crane.
- **`wrapped-czkawka-gui`** — Shell wrapper that sets `GSETTINGS_SCHEMA_DIR` before launching.
- **`czkawka-gui-wayland`** — GTK4 GUI build with Wayland support (`pkgs.wayland` added to
  buildInputs).
- **`czkawka-cli`** — CLI-only build (no system dependencies).

Default package: `czkawka-gui-wayland`.

---

## 7. add_icon_exe

### `Cargo.toml` ([misc/add_icon_exe/Cargo.toml](misc/add_icon_exe/Cargo.toml))

A small helper crate that embeds a PNG icon into a Windows PE executable. Uses the
[`editpe`](https://crates.io/crates/editpe) crate (v0.2.1) — a pure-Rust PE resource editor.

**Purpose:** Strips the need for `windres` / Resource Compiler on Windows CI. The binary is
compiled without an icon, then this tool patches the `.exe` afterward.

---

## 8. ci_tester

### `Cargo.toml` ([ci_tester/Cargo.toml](ci_tester/Cargo.toml))

A standalone Rust binary for integration testing of the Czkawka CLI.

**Release profile:** Enables `debug-assertions`, `overflow-checks`, and `debug = true` — so CI
catches panics and overflows even in release mode.

**Dependencies:**
- `state` (0.6.0) — global cell for storing the Czkawka binary path.
- `handsome_logger` (0.9.1) — colored terminal logging.
- `log` (0.4.20) — log facade.

### `main.rs` ([ci_tester/src/main.rs](ci_tester/src/main.rs))

**Purpose:** End-to-end integration tester for the `czkawka_cli` binary. It runs the CLI against a
`TestFiles.zip` archive containing a fixed set of test files (images, music, videos, symlinks,
broken files, empty folders, etc.), then verifies the exact files/folders/symlinks that would be
deleted or reported by each tool.

**Architecture:**

1. **`main()`** ([ci_tester/src/main.rs:41](ci_tester/src/main.rs:41)):
   - Accepts a single argument: path to the `czkawka_cli` binary.
   - Runs [`test_args()`](ci_tester/src/main.rs:30) — quick smoke test: runs all 11 modes with a
     dummy directory.
   - Unzips `TestFiles.zip`, collects the full file/folder/symlink tree into
     [`CollectedFiles`](ci_tester/src/main.rs:9).
   - Runs the full test suite **10 times** (`ATTEMPTS = 10`) for statistical reliability.

2. **Test functions** ([ci_tester/src/main.rs:59](ci_tester/src/main.rs:59)) — Each calls
   [`run_test()`](ci_tester/src/main.rs:412) with CLI arguments and three lists of **expected
   deletions** (files, folders, symlinks):
   - `test_empty_files()` — finds empty files
   - `test_big_files()` / `test_smallest_files()` / `test_biggest_files()` — big/small file modes
   - `test_empty_folders()` — empty folder detection
   - `test_temporary_files()` — temporary file detection
   - `test_symlinks_files()` — invalid symlink detection
   - `test_remove_duplicates_*()` — 6 deletion strategies for duplicates
   - `test_remove_same_music_tags_*()` — 8 deletion strategies for same-music (tags mode)
   - `test_remove_same_music_content_*()` — 8 deletion strategies for same-music (content mode)
   - `test_remove_videos_*()` — 8 deletion strategies for similar videos

3. **Deletion strategy flags** (CLI `-D` argument):
   - `OO` = One Oldest
   - `ON` = One Newest
   - `OS` = One Smallest
   - `OB` = One Biggest
   - `AEO` = All Except Oldest
   - `AEN` = All Except Newest
   - `AES` = All Except Smallest
   - `AEB` = All Except Biggest

4. **Helper functions:**
   - [`run_with_good_status()`](ci_tester/src/main.rs:437) — Runs a CLI command, sets
     `ENABLE_TERMINAL_LOGS_IN_CLI=1` and `RUST_BACKTRACE=1`, asserts success.
   - [`collect_all_files_and_dirs()`](ci_tester/src/main.rs:488) — Walks a directory tree and
     returns a `CollectedFiles` struct with sorted `BTreeSet`s of files, folders, and symlinks.
   - [`file_folder_diffs()`](ci_tester/src/main.rs:452) — Compares the "before" file tree with
     the "after" tree to determine what was deleted, then asserts against expected results.
