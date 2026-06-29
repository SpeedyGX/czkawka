# Top-Level Project Structure — Czkawka

> **Generated:** 2026-06-29
> **Project root:** `/home/speedy/Projects/czkawka`

---

## 1. Cargo.toml (Workspace Root)

**File:** [`Cargo.toml`](../Cargo.toml)

### Workspace Members

```toml
[workspace]
members = [
    "czkawka_core",    # Scanning logic – shared library used by all frontends
    "czkawka_cli",     # Command-line interface
    "czkawka_gui",     # Legacy GTK 4 GUI (maintenance mode only)
    "czkawka_web",     # Web GUI (HTTP server + frontend)
    "cedinia",         # Android / mobile GUI – Slint-based
    "krokiet",         # Primary desktop GUI – Slint-based
]
```

### Workspace Exclusions

```toml
exclude = [
    "misc/test_read_perf",
    "misc/test_image_perf",
    "misc/test_compilation_speed_size",
    "ci_tester",
    "test"
]
```

### Workspace Settings

| Setting | Value |
|---------|-------|
| Resolver | `3` |
| Minimum Rust | 1.92.0 (applied in CI) |
| Edition | 2024 (per `AGENTS.md`, throughout) |

### Commented-Out Slint Patch

Lines 21–23 contain a temporary/commented patch for Slint mouse event spam (relevant to Cedinia):

```toml
#[patch.crates-io]
#slint = { git = "https://github.com/slint-ui/slint.git" }
#slint-build = { git = "https://github.com/slint-ui/slint.git" }
```

### Profile Configurations

#### `[profile.release]` (lines 25–34)

```toml
panic = "unwind"         # Allows catching panics from file-parsing libraries
overflow-checks = true   # Finds hidden panics, improves long-term stability
```

- **LTO is OFF** in the default release profile for faster local iteration.
- Two dedicated profiles below provide production-optimised binaries.

#### `[profile.dev.package."*"]` (lines 40–41)

```toml
opt-level = 3
```

Optimises all dependencies (even debug builds) to get reasonable performance when opening images, etc.

#### `[profile.fast_release]` (lines 43–48)

| Setting | Value |
|---------|-------|
| inherits | `release` |
| incremental | `true` |
| overflow-checks | `true` |
| debug | `false` |
| strip | `true` |

Purpose: **Fast iteration** — incremental compilation, stripped, no debug symbols.

#### `[profile.test]` (lines 50–53)

```toml
debug-assertions = true  # Forces crash on duplicated items in CLI
overflow-checks = true
opt-level = 3
```

#### `[profile.fastci]` (lines 56–60)

```toml
inherits = "dev"
strip = "symbols"
debug = false
lto = "off"
```

Purpose: **Fast CI builds** — small binary, quick compilation.

#### `[profile.rdebug]` (lines 62–66)

```toml
inherits = "release"
debug-assertions = false
debug = "full"
strip = "none"
```

Purpose: **Release with full debug symbols** for profiling.

#### `[profile.release-lto]` (lines 69–73)

```toml
inherits = "release"
lto = "fat"
codegen-units = 1
strip = "symbols"
```

Purpose: **Production-optimised binary** with full LTO and single codegen unit.

#### `[profile.fastest]` (lines 76–83)

```toml
inherits = "release"
panic = "abort"
lto = "fat"
strip = "symbols"
codegen-units = 1
opt-level = 3
debug = false
```

Purpose: **Maximum speed/size** — benchmarks and proof-of-concept. Uses `panic=abort` (unsafe for production use with file-parsing libraries).

### Workspace Lints (lines 85–199)

The workspace defines an extensive set of Clippy lints:

**Allowed lints** (lines 86–92):
- `clippy.unreachable`
- `clippy.enum_variant_names`
- `clippy.too_many_arguments`
- `clippy.type_complexity`
- `clippy.collapsible_else_if`
- `clippy.iter_on_single_items`
- `clippy.needless_range_loop`

**Warning-level lints** (lines 94–105, including commented):
- `clippy.doc_broken_link`, `clippy.ip_constant`, `clippy.unnecessary_semicolon`
- `clippy.trivially_copy_pass_by_ref`, `clippy.indexing_slicing`
- `clippy.non_std_lazy_statics`, `clippy.undocumented_unsafe_blocks`
- `clippy.manual_midpoint`, `clippy.ignore_without_reason`
- `clippy.elidable_lifetime_names`

Plus ~80 additional warning-level lints covering topics like: `allow_attributes`, `assertions_on_result_states`, `bool_to_int_with_if`, `branches_sharing_code`, `dbg_macro`, `enum_glob_use`, `float_cmp`, `implicit_clone`, `large_stack_arrays`, `manual_let_else`, `match_same_arms`, `mutex_atomic`, `needless_collect`, `print_stderr`/`print_stdout`, `redundant_clone`, `string_slice`, `todo`, `uninlined_format_args`, `unwrap_used`, `use_self`, `wildcard_imports`, and many more.

---

## 2. AGENTS.md — Coding Guidelines

**File:** [`AGENTS.md`](../AGENTS.md)

This is the primary developer guide for the codebase. Key points:

### Language
- All code, comments, commit messages, and documentation must be written in **English**.

### Comments
- **Keep comments minimal.** Code should be self-documenting through clear naming.
- Add comments only when the _why_ is not obvious (algorithmic choices, non-obvious constraints, workarounds).

### Panics and `expect()`
- **`expect()` is preferred** over silently ignoring failures when the program would be left in an inconsistent state.
- Use `expect()` for **logic invariants** (things that cannot fail unless there's a programming error).
- Use proper `Result`/`Option` propagation for **expected failures** (I/O errors, missing files, etc.).
- Never silently swallow errors with `let _ = ...` unless the failure is genuinely irrelevant.
- Prefer `unwrap_or_default()` / `unwrap_or_else()` over `unwrap()` when a sensible fallback exists.

### Non-Negotiable Project Goals
1. **Performance first** — parallelism via `rayon`, efficient algorithms (perceptual hashing, `blake3`), careful memory use. Avoid unnecessary allocations/copies in hot paths.
2. **Minimal non-Rust dependencies** — prefer pure-Rust crates. Native libraries must be gated behind optional Cargo features.

### Quality Gate (`just fix`)
Running `just fix` must pass before any merge request. It runs:
1. `ruff format` — Python formatting
2. `mypy misc --strict` — Python type checking
3. `bash misc/run_checks.sh` — project-specific Python checks (unused Slint imports, unused translations, etc.)
4. `cargo +nightly fmt` + `cargo fmt` — Rust formatting
5. `cargo clippy --fix` — Rust linting (two passes)

### Workspace Structure
```
czkawka/
├── czkawka_core/   # Scanning logic – shared library
├── czkawka_cli/    # Command-line interface
├── czkawka_gui/    # Legacy GTK 4 GUI (maintenance mode only)
├── krokiet/        # Primary desktop GUI – Slint-based
├── cedinia/        # Android / mobile GUI – Slint-based
└── misc/           # Scripts
```

### i18n Translation Macros

| Project | Macro | File pattern |
|---------|-------|-------------|
| krokiet | `flk!` | `krokiet/i18n/<lang>/krokiet.ftl` |
| cedinia | `flc!` | `cedinia/i18n/<lang>/cedinia.ftl` |
| czkawka_core | `flc!` | `czkawka_core/i18n/<lang>/czkawka_core.ftl` |
| czkawka_gui | `flg!` | `czkawka_gui/i18n/<lang>/czkawka_gui.ftl` |

---

## 3. `.rustfmt.toml` — Formatting Configuration

**File:** [`.rustfmt.toml`](../.rustfmt.toml)

```toml
newline_style = "Unix"
max_width = 180

# Enable only with nightly channel via: cargo +nightly fmt
imports_granularity = "Module"
group_imports = "StdExternalCrate"
```

| Setting | Value | Notes |
|---------|-------|-------|
| `newline_style` | `Unix` | LF line endings |
| `max_width` | `180` | Quite wide, well above default 100 |
| `imports_granularity` | `Module` | Nightly-only; groups imports by module |
| `group_imports` | `StdExternalCrate` | Nightly-only; std first, then external, then crate |

---

## 4. `clippy.toml` — Clippy Configuration

**File:** [`clippy.toml`](../clippy.toml)

```toml
allow-indexing-slicing-in-tests = true
allow-unwrap-in-tests = true
avoid-breaking-exported-api = false
```

| Setting | Value | Meaning |
|---------|-------|---------|
| `allow-indexing-slicing-in-tests` | `true` | Indexing/slicing is allowed in test code |
| `allow-unwrap-in-tests` | `true` | `unwrap()` is allowed in test code (consistent with AGENTS.md guidance) |
| `avoid-breaking-exported-api` | `false` | Clippy will suggest breaking API changes |

---

## 5. `justfile` — Available Commands

**File:** [`justfile`](../justfile)

The justfile is the command hub for the project. It uses `set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]` for Windows compatibility and `set export := true` to export variables.

### Build Commands

| Command | Description |
|---------|-------------|
| `build_all` | Run `fix`, then `cargo build --release`, `cargo build`, `cargo clippy`, `cargo test` |
| `build-krokiet` | Build krokiet with `--release` and features: `heif,libraw,libavif,winit_skia_opengl` |
| `build-krokiet-lto` | Build krokiet with `--profile release-lto` and full features |
| `build-web` | Build czkawka_web release binary |
| `build-web-lto` | Build czkawka_web with release-lto profile |

### Run Commands

| Command | Description |
|---------|-------------|
| `run +args` | `cargo run --bin {{args}}` (debug) |
| `runr +args` | `cargo run --profile fast_release --bin {{args}}` |
| `runc +args` | `cargo +nightly run -Zcodegen-backend` with Cranelift backend |
| `runs +args` | Run with AddressSanitizer (`-Zsanitizer=address`) |
| `run-web` | Run czkawka_web (debug) |
| `runr-web` | Run czkawka_web (fast_release) |

### Quality Commands

| Command | Description |
|---------|-------------|
| `fix` | Full quality gate: `ruff format` → `mypy` → `run_checks.sh` → `cargo fmt` → `cargo clippy --fix` (two passes) |
| `fixn` | Nightly-only fix: `cargo +nightly fmt` → `cargo +nightly clippy --fix` → `cargo +nightly fmt` |
| `clip` | Clippy fix (two passes) |

### Testing & Benchmarking

| Command | Description |
|---------|-------------|
| `itests` | Integration tests: download TestFiles, run `ci_tester` |
| `bench` | Run benchmarks in czkawka_core and open Criterion report |
| `bench_clean` | Remove Criterion results |
| `benchmark media=<path>` | Hyperfine benchmarking against cached binaries |

### Profiling & Analysis

| Command | Description |
|---------|-------------|
| `val bin=<name>` | Valgrind memory check (debug) |
| `valr bin=<name>` | Valgrind memory check (release) |
| `samply bin=<name> *args` | Profile with samply (debug) |
| `samplyrd bin=<name> *args` | Profile with samply (rdebug) |
| `llvm_lines` | Show top LLVM lines in binaries |
| `bloat_by_function` | Show largest functions by size |
| `bloat_by_crate` | Show largest crates by size |
| `dependencies_graph` | Generate dependency graphs (PNG) |
| `profiling` | LLVM self-profile timing |
| `timings` | Cargo build timings (HTML reports) |
| `time_passes` | Per-crate `-Ztime-passes` |
| `heaptrack bin=<name>` | Heap profiling with heaptrack |
| `test_heaptrack` | Heap profiling for test binary |

### Android Commands

| Command | Description |
|---------|-------------|
| `gen_keystores` | Generate debug/rdebug/release keystores |
| `android_build` | Build APK via `cargo apk` |
| `android_build_release` | Build release APK |
| `android_install` / `android_install_release` | Install APK via ADB |
| `android_run` | Launch app via ADB |
| `android_log` / `android_logc` | View Android logs |
| `android_devices` | List ADB devices |
| `android` / `androidr` | Full build+install+run (debug/release) |
| `android_build_aab` | Build signed AAB for Google Play Store |

### Web Commands

| Command | Description |
|---------|-------------|
| `docker-web` | Build Docker image for czkawka_web |
| `docker-run-web` | Run Docker container (port 8095) |
| `compose-web` | Build and run via Docker Compose |

### Translation Commands

| Command | Description |
|---------|-------------|
| `prepare_translations_deps` | Install `uv` and `ollama` (with translation models) |
| `translate` | AI-translate all projects and pack |
| `validate_translations [--fix]` | Validate placeholders across all translations |
| `pack_translations` | Create `i18n_translations.zip` for Crowdin (excludes English) |
| `unpack_translations <path>` | Unpack Crowdin translations back into repo |

### Misc Commands

| Command | Description |
|---------|-------------|
| `upgrade` | `cargo +nightly update --breaking` + `cargo update` |
| `prepare_binaries` | Download nightly binaries for benchmarking |
| `check_compilations` | Check compilation speed/size |
| `tags` | Show diff stats between git tags |
| `install` | Install czkawka_cli, krokiet, czkawka_gui via `cargo install --path` |
| `cache` | Open `~/.cache/czkawka` in file manager |
| `configc` / `configk` | Open config directories for czkawka/krokiet |
| `setup_sanitizer` | Install nightly + ASan components |
| `setup_verify_tools` | Install llvm-tools, cargo-llvm-lines, cargo-bloat, etc. |
| `gen_cedinia_licenses` | Generate THIRD_PARTY_LICENSES.txt for Cedinia |
| `test_resize arg=<path>` | Build and run image resize performance test |

---

## 6. `.github/` Directory — CI/CD

**Directory:** [`.github/`](../.github/)

### Structure

```
.github/
├── FUNDING.yml                    # GitHub Sponsors (qarmin)
├── ISSUE_TEMPLATE/
│   ├── bug_report.md              # Bug report template
│   └── feature_request.md         # Feature request template
└── workflows/
    ├── linux.yml                  # Linux builds (x86_64, ARM64, MUSL, 32-bit)
    ├── windows.yml                # Windows builds (cross-compiled + native MSVC)
    ├── mac.yml                    # macOS builds (x86_64, ARM64)
    ├── android.yml                # Android APK + AAB builds
    └── quality.yml                # Formatting + Clippy checks
```

### CI Triggers
All workflows trigger on: `push`, `pull_request`, and scheduled (weekly on Tuesdays at midnight).

### Workflow: Linux (`linux.yml`)
- **Jobs:**
  - `linux-all` — ubuntu-22.04 (x86_64 + ARM64). Builds release (master branch) or fastci (PRs). Produces CLI, GTK GUI, and 5 Krokiet variants (default, skia_opengl, skia_vulkan, femtovg_wgpu, all_backends). Packages as 7z.
  - `linux-all-extra` — ubuntu-24.04 (x86_64 + ARM64). Same as above but with `heif,libraw,libavif` features enabled.
  - `linux-cli-musl` — Static MUSL build of `czkawka_cli` only.
  - `linux-all-debug-32bit` — 32-bit (i686) debug build for PRs only.
  - `linux-stability` — Builds debug+release twice; compares outputs with `misc/compare_files.sh`.
  - `linux-tests` — Runs `cargo test` with xvfb-run (for GUI tests).
  - `linux-regression-tests-on-minimal-rust-version` — Runs `ci_tester` against TestFiles.
  - `android` — `cargo check` for `aarch64-linux-android` target.
- **Nightly releases:** Uses `softprops/action-gh-release@v2` with tag `Nightly` (master branch only).
- **Rust version:** 1.92.0 throughout.

### Workflow: Windows (`windows.yml`)
- **Jobs:**
  - `krokiet-compiled-on-linux` — Cross-compiles krokiet.exe via `x86_64-pc-windows-gnu` target on Ubuntu.
  - `krokiet-compiled-on-windows` — Native MSVC build on `windows-latest`. Produces 4 Krokiet variants.
  - `container_4_12` — Cross-compiles GTK GUI + CLI using a GTK4 4.12 Docker image. Packages everything (GTK GUI, Krokiet, DLLs, themes, launcher scripts).
  - `windows-tests` — Runs `cargo test -p czkawka_core -p krokiet`.

### Workflow: macOS (`mac.yml`)
- **Jobs:**
  - `macos` — `macos-latest`. Builds release and debug variants. Produces CLI, GTK GUI, Krokiet (with/without heif+avif features, multiple backends). Packages Krokiet with launcher scripts.

### Workflow: Android (`android.yml`)
- **Jobs:**
  - `build-apk` — Sets up Android SDK/NDK (27.2.12479018), generates keystores, builds APK + AAB. Min SDK 26, Target SDK 35.
- **Android-specific:** Uses `cargo-apk` for APK, Gradle 8.9 for AAB.

### Workflow: Quality (`quality.yml`)
- **Jobs:**
  - `quality` — `cargo fmt --check` + `cargo clippy --all-targets --all-features -- -D warnings` (two passes). Disables optimised dev packages to save CI time.

### Issue Templates
- `bug_report.md` — Asks for bug description, steps, terminal output, system info.
- `feature_request.md` — Simple template for feature suggestions.

### Funding
- [`FUNDING.yml`](../.github/FUNDING.yml) — GitHub Sponsors pointing to `qarmin`.

---

## 7. `.cargo/config.toml` — Cargo Configuration

**File:** [`.cargo/config.toml`](../.cargo/config.toml)

```toml
[target.x86_64-pc-windows-msvc]
rustflags = ["-C", "link-arg=/STACK:8000000"]

[target.aarch64-pc-windows-msvc]
rustflags = ["-C", "link-arg=/STACK:8000000"]
```

Increases the default stack size to 8 MB for Windows MSVC targets (matching Linux's default), preventing stack overflow in debug builds.

---

## 8. `Cargo.lock`

**File:** [`Cargo.lock`](../Cargo.lock)

- **Exists:** Yes
- **Size:** Cannot be measured from this mode, but it is a standard Cargo lockfile for a Rust workspace with ~6 crates and extensive dependencies.
- The lockfile is committed to the repository (as is standard Rust practice).

---

## 9. `data/` Directory — Linux Desktop Integration

**Directory:** [`data/`](../data/)

```
data/
├── com.github.qarmin.czkawka.desktop         # Desktop entry for GTK GUI
├── com.github.qarmin.czkawka.metainfo.xml    # AppStream metadata for GTK GUI
├── io.github.qarmin.krokiet.desktop          # Desktop entry for Krokiet
├── io.github.qarmin.krokiet.metainfo.xml     # AppStream metadata for Krokiet
└── icons/
    ├── com.github.qarmin.czkawka-symbolic.svg
    ├── com.github.qarmin.czkawka.Devel.svg
    ├── com.github.qarmin.czkawka.svg
    └── io.github.qarmin.krokiet.svg
```

### Desktop Files

| File | App Name | Exec | Icon |
|------|----------|------|------|
| `com.github.qarmin.czkawka.desktop` | Czkawka | `czkawka_gui` | `com.github.qarmin.czkawka` |
| `io.github.qarmin.krokiet.desktop` | Krokiet | `krokiet` | `io.github.qarmin.krokiet` |

Both are categorised as `System;FileTools` and include multi-language Name/Comment/Keywords entries.

### AppStream Metadata

| File | App ID | License | Developer |
|------|--------|---------|-----------|
| `com.github.qarmin.czkawka.metainfo.xml` | `com.github.qarmin.czkawka` | MIT | Rafał Mikrut |
| `io.github.qarmin.krokiet.metainfo.xml` | `io.github.qarmin.krokiet` | GPL-3.0-only | Rafał Mikrut |

Both include screenshots and references to the GitHub repo, issue tracker, Crowdin translation platform, and GitHub Sponsors.

**Note:** The two applications have different licenses — Czkawka (GTK GUI) is MIT-licensed, while Krokiet is GPL-3.0-only.

---

## 10. `instructions/` Directory — User Documentation

**Directory:** [`instructions/`](../instructions/)

```
instructions/
├── Instruction.md         # Comprehensive user manual
└── Translations.md        # Translation contribution guide
```

### `Instruction.md`
A detailed user manual covering:
- **GUI Krokiet** — Interface layout (left panel, top bar, directory selection, results area, bottom panel, right preview panel), settings screens (general, performance, tool-specific), translations.
- **GUI GTK** — Legacy interface overview (noted as being replaced by Krokiet).
- **Terminology** — Reference paths, included/excluded paths, config vs cache.
- **CLI** — Usage examples, exit codes (0=ok, 1=error, 11=files found).
- **Common Workflows** — Step-by-step guides for finding/removing duplicates, finding similar images, finding large files, working with reference paths.
- **Config/Cache Files** — Locations per platform (Linux, Flatpak, Mac, Windows), environment variables (`CZKAWKA_CONFIG_PATH`, `CZKAWKA_CACHE_PATH`) for portable mode.
- **Tips, Tricks and Known Bugs** — LTO speedup, native CPU optimizations, cache management, partial scanning, manual config editing.
- **Tools Descriptions** — In-depth documentation of all 14 tools: Duplicate Finder, Empty Files, Empty Directories, Big Files, Temporary Files, Invalid Symlinks, Same Music, Similar Images, Similar Videos, Broken Files, Bad Extensions, Bad Names, EXIF Remover, Video Optimizer.

### `Translations.md`
Brief guide explaining:
- Czkawka supports ~20 languages via Fluent localization.
- English and Polish are officially supported.
- Translations managed on Crowdin: https://crowdin.com/project/czkawka
- Machine translations (Crowdin MT + local LLMs) fill gaps for less-active languages.

---

## 11. `plans/` Directory — Implementation Plans

**Directory:** [`plans/`](../plans/)

```
plans/
├── czkawka_web_result_perf.md        # Results rendering performance optimization
├── czkawka_web_self_contained.md     # Self-contained binary plan (rust-embed)
└── czkawka_web_server.md             # Initial web server implementation plan
```

All three plans relate to the `czkawka_web` project.

### `czkawka_web_server.md`
The **original implementation plan** for the czkawka_web HTTP server. Documents:
- Architecture diagram (browser ↔ axum HTTP server ↔ ScanManager ↔ czkawka_core)
- REST API design (scan endpoints, WebSocket progress, results, file actions)
- Crate structure (`scan_manager.rs`, `api/`, `ws.rs`, `errors.rs`)
- `ScanManager` struct with `HashMap<scan_id, ScanState>`
- Minimal Web UI specification (vanilla JS or Svelte)
- Implementation milestones (~7–8 hours for prototype)

### `czkawka_web_self_contained.md`
A **plan to make czkawka_web a portable single binary** by:
- Embedding static files (`index.html`, `app.js`, `style.css`) via `rust-embed`
- Creating a multi-stage Dockerfile (rust:alpine → scratch)
- Adding justfile recipes (`build-web`, `run-web`, `docker-web`, etc.)
- Writing README documentation
- The plan appears to have been implemented (the embedded.rs file and justfile recipes exist).

### `czkawka_web_result_perf.md`
A **performance optimization plan** addressing:
- **Problem:** `renderResults()` builds all HTML at once for thousands of files, attaches individual event listeners per button, causing main-thread blocking.
- **Solution:** Two changes:
  1. **Event delegation** — Replace per-button `querySelectorAll`+listeners with a single delegated click handler on `#results-body`.
  2. **Client-side pagination** — Add `pageSize`, `currentPage`, `totalPages` state; render only the current page's rows.
- **Rejected:** Virtual scrolling (deemed overkill for the grouped result structure).
- Includes detailed code examples, HTML/CSS changes, edge case handling, and a testing plan.

---

## 12. Other Top-Level Files

| File | Description |
|------|-------------|
| [`.dockerignore`](../.dockerignore) | Excludes `target/`, `.git/`, `*.md`, `.gitignore`, `plans/`, `.github/` from Docker build context |
| [`.gitignore`](../.gitignore) | Ignores `/target`, `.idea/`, `*.iml`, `*.zip`, `*.zst`, `*.profraw`, `*.aab`, `*.gz`, `ci_tester/target`, `benchmarks`, `.venv`, `i18n`, `keystore_pass`, etc. |
| [`.mailmap`](../.mailmap) | Maps contributor aliases/emails for accurate git statistics (maps `TheEvilSkeleton` and Rafał Mikrut's various emails) |
| [`LICENSE_CC_BY_4_ICONS`](../LICENSE_CC_BY_4_ICONS) | Icon assets licensed under CC BY 4.0 |
| [`LICENSE_MIT_EVERYTHING_OUTSIDE_ANY_CARGO_APP_LIBRARY`](../LICENSE_MIT_EVERYTHING_OUTSIDE_ANY_CARGO_APP_LIBRARY) | Non-crate assets licensed under MIT |
| [`Changelog.md`](../Changelog.md) | Documents changes up to version 11.0.1 and upcoming unreleased changes |

### Changelog Highlights (from `Changelog.md`)

The changelog documents recent improvements including:
- **Performance:** Optimized image hashing (avoid collecting errors into Vec), dynamic BK-tree chunking, `RwLock` instead of `Mutex` for `SharedModels`.
- **UI/UX (Krokiet):** Filter active indicator, preview panel close button, fixed keyboard navigation, `ActiveTab` lookup table, filter cache LRU eviction.
- **Core:** Switched AV1 encoding from `libaom-av1` to `libsvtav1`, noise reduction in Video Optimizer, custom optimization commands, hardware-accelerated encoding, broken files multi-checker, split fast/slow video checking.
- **Krokiet:** Separate trash/delete buttons, custom selection popup, image comparison tool, context menu, non-blocking file dialogs, notification support.
- **Cedinia:** Initial experimental Android release.
- **Build:** Added `release-lto` profile.

---

## Summary

This is a **Rust workspace** (resolver v3, edition 2024, minimum Rust 1.92.0) containing **6 workspace crates**:

| Crate | Purpose | Status |
|-------|---------|--------|
| `czkawka_core` | Shared scanning engine | Active development |
| `czkawka_cli` | Command-line interface | Active development |
| `krokiet` | Primary desktop GUI (Slint) | Active development – **recommended** |
| `cedinia` | Android/mobile GUI (Slint) | Active development |
| `czkawka_web` | Web GUI (axum + vanilla JS) | Active development |
| `czkawka_gui` | Legacy GTK 4 GUI | **Maintenance mode only** |

The project is focused on **performance** (rayon, Blake3, perceptual hashing) and **minimal native dependencies**. Code quality is enforced through an extensive `just fix` pipeline (formatting, linting, Python checks). CI/CD covers Linux (x86_64, ARM64, MUSL, 32-bit), Windows (MSVC, MinGW), macOS, and Android. Translations are managed via Crowdin with AI-assisted fills.
