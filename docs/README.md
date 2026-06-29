# Czkawka — Master Documentation Index

> **Generated:** 2026-06-29
> **Project root:** [`/home/speedy/Projects/czkawka`](..)
> **Latest version:** 11.0.1
> **License:** MIT (core, CLI, GTK GUI) / GPL-3.0-only (Krokiet, Cedinia)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Map](#2-repository-map)
3. [Quick Navigation](#3-quick-navigation)
4. [Architecture Overview](#4-architecture-overview)
5. [Technology Stack](#5-technology-stack)
6. [Key Design Decisions](#6-key-design-decisions)
7. [Tool Comparison Across Frontends](#7-tool-comparison-across-frontends)
8. [File Action Matrix](#8-file-action-matrix)
9. [Development Workflow](#9-development-workflow)
10. [Dependencies Overview](#10-dependencies-overview)
11. [Related Documentation](#11-related-documentation)

---

## 1. Project Overview

**Czkawka** (pronounced *ch-KAV-ka*, Polish for "hiccup") is a fast, multi-functional file
cleanup tool suite. It helps users find and manage:

- **Duplicate files** (by name, size, hash)
- **Similar images** (perceptual hashing with BK-tree search)
- **Similar videos** (fingerprinting via `vid_dup_finder_lib`)
- **Duplicate music** (tag comparison or audio fingerprinting)
- **Empty files and folders**
- **Big files** (largest/smallest)
- **Temporary files**
- **Broken files** (images, archives, audio, PDFs, videos)
- **Bad file extensions** (content vs. extension mismatch)
- **Bad file names** (emoji, spaces, non-ASCII, uppercase extensions)
- **Invalid symlinks**
- **EXIF metadata** (view and remove)
- **Video optimization** (transcode and crop)

The project is organized as a **Rust workspace** (resolver v3, edition 2024, minimum Rust 1.92.0)
with a shared core library and multiple frontends.

---

## 2. Repository Map

| #  | Crate / Directory | Purpose | Status | Frontend Type | Doc |
|----|-------------------|---------|--------|---------------|-----|
| 1 | [`czkawka_core`](../czkawka_core/) | Shared scanning engine — all 14 tools | Active | — (library) | [02-czkawka-core.md](02-czkawka-core.md) |
| 2 | [`krokiet`](../krokiet/) | Primary desktop GUI — **Slint**-based | Active | Desktop (Slint) | [03-krokiet.md](03-krokiet.md) |
| 3 | [`cedinia`](../cedinia/) | Android / mobile GUI — **Slint**-based | Active | Mobile (Slint) | [04-cedinia.md](04-cedinia.md) |
| 4 | [`czkawka_cli`](../czkawka_cli/) | Command-line interface | Active | CLI | [05-czkawka-cli.md](05-czkawka-cli.md) |
| 5 | [`czkawka_web`](../czkawka_web/) | Web interface (axum + vanilla JS) | Active | Web (HTTP) | [07-czkawka-web.md](07-czkawka-web.md) |
| 6 | [`czkawka_gui`](../czkawka_gui/) | Legacy GTK 4 GUI | **Maintenance only** | Desktop (GTK4) | [06-czkawka-gui.md](06-czkawka-gui.md) |
| 7 | [`misc/`](../misc/) | Python scripts, CI helpers, Nix/Docker, packaging | — | — | [08-misc-scripts.md](08-misc-scripts.md) |
| 8 | [`data/`](../data/) | Linux desktop integration files (.desktop, AppStream, icons) | — | — | [01-top-level-structure.md](01-top-level-structure.md#9-data-directory--linux-desktop-integration) |
| 9 | [`instructions/`](../instructions/) | User documentation (manual, translation guide) | — | — | [01-top-level-structure.md](01-top-level-structure.md#10-instructions-directory--user-documentation) |
| 10 | [`plans/`](../plans/) | Implementation plans (web server, performance) | — | — | [01-top-level-structure.md](01-top-level-structure.md#11-plans-directory--implementation-plans) |
| 11 | [`ci_tester/`](../ci_tester/) | Integration test runner for CLI | — | — | [08-misc-scripts.md](08-misc-scripts.md#8-ci_tester) |
| 12 | [`.github/`](../.github/) | CI/CD workflows, issue templates, funding | — | — | [01-top-level-structure.md](01-top-level-structure.md#6-github-directory--cicd) |

---

## 3. Quick Navigation

| Document | Covers |
|----------|--------|
| [`01-top-level-structure.md`](01-top-level-structure.md) | Workspace root — `Cargo.toml` profiles & lints, `AGENTS.md` guidelines, `.rustfmt.toml`, `clippy.toml`, `justfile` commands, CI/CD pipelines (Linux/Windows/macOS/Android), `.cargo/config.toml`, `data/` desktop files, `instructions/` user docs, `plans/` implementation plans, top-level files |
| [`02-czkawka-core.md`](02-czkawka-core.md) | Shared scanning engine — every tool's algorithm in detail, common infrastructure (directory traversal, caching, progress reporting, image/video/audio processing), 14 tools, benchmarks, test resources, i18n |
| [`03-krokiet.md`](03-krokiet.md) | Primary Slint desktop GUI — initialization flow, all `connect_*.rs` callback handlers, 14 scan tool implementations, model layer (`SimplerSingleMainListModel`), selection logic, file actions (delete/rename/move/hardlink/symlink/clean EXIF/optimize video), settings system, UI structure (21 Slint files, 18 popup files), icons, translations |
| [`04-cedinia.md`](04-cedinia.md) | Android/mobile Slint GUI — entry points (Android `android_main` + desktop `run_app`), JNI file picker bridge, DEX assembly at build time, scan runner architecture, thumbnailing system, notifications (Android + desktop), volume detection, Slint UI (16 files), key differences from Krokiet |
| [`05-czkawka-cli.md`](05-czkawka-cli.md) | CLI wrapper — `clap` argument definitions for all 14 subcommands, execution model (two-thread pattern), progress bar rendering with `indicatif`, output formats (text, compact JSON, pretty JSON), all value parsers and validators |
| [`06-czkawka-gui.md`](06-czkawka-gui.md) | Legacy GTK 4 GUI — architecture (23 callback modules), UI loading from Cambalache XML, ListStore column layouts for 11 tools, SVG rendering pipeline, Windows taskbar progress, GTK widget traits |
| [`07-czkawka-web.md`](07-czkawka-web.md) | Web interface — axum router, REST + WebSocket protocol, ScanManager lifecycle, static file embedding via `rust-embed`, frontend architecture (vanilla JS SPA), Docker setup, security considerations |
| [`08-misc-scripts.md`](08-misc-scripts.md) | AI translation pipeline (Ollama-based), `run_checks.sh` quality scripts (12 checks), build/packaging scripts, Cargo publish scripts, Docker/Nix infrastructure, `ci_tester` integration tester |
| [`09-i18n-system.md`](09-i18n-system.md) | Translation system across all crates — Fluent file structure, `flk!`/`flc!`/`flg!` macros, key counts per crate (~500 Krokiet / ~361 Cedinia / ~610 GTK GUI / ~110 Core), 27 supported languages, Crowdin workflow, placeholder patterns |

---

## 4. Architecture Overview

```
                                   ┌──────────────────────┐
                                   │     czkawka_core      │
                                   │   (Shared Engine)      │
                                   │    14 scanning tools   │
                                   │  CommonData + Traits   │
                                   │  DirTraversal + Cache  │
                                   └──────────┬───────────┘
                                              │
            ┌─────────────────┬───────────────┼───────────────┬─────────────────┐
            │                 │               │               │                 │
            ▼                 ▼               ▼               ▼                 ▼
    ┌──────────────┐  ┌──────────────┐ ┌──────────┐  ┌──────────────┐  ┌──────────────┐
    │   krokiet    │  │   cedinia    │ │ czkawka_ │  │ czkawka_gui  │  │ czkawka_cli  │
    │  (Slint GUI) │  │ (Android GUI)│ │   web    │  │ (GTK4, maint)│  │    (CLI)     │
    │  ~21 .slint  │  │  ~16 .slint  │ │ axum +   │  │ XML .ui      │  │ clap +       │
    │  files       │  │  files       │ │ vanilla  │  │ GTK4-rs      │  │ indicatif    │
    │  14 tools    │  │  11 tools    │ │ JS       │  │ 11 tools     │  │ 14 tools     │
    │  GPL-3.0     │  │  GPL-3.0     │ │ 3 tools  │  │ MIT          │  │ MIT          │
    └──────────────┘  └──────────────┘ └──────────┘  └──────────────┘  └──────────────┘
```

### Data Flow

All frontends follow the same core pattern:

1. **Configure** — Build tool parameters from user settings (GUI widgets, CLI args, HTTP JSON body).
2. **Execute** — Call `tool.search(&stop_flag, Some(&progress_sender))` on a dedicated OS thread.
3. **Progress** — Worker threads send [`ProgressData`](../czkawka_core/src/common/progress_data.rs:73)
   over a `crossbeam_channel` at ~200ms intervals.
4. **Cancel** — An [`Arc<AtomicBool>`](../czkawka_core/src/common/progress_stop_handler.rs:15)
   stop flag is polled throughout scanning; tools return early when set.
5. **Results** — Completed results are stored in shared state (e.g.,
   [`SharedModels`](../krokiet/src/shared_models.rs:1), JSON, or `gtk4::ListStore`).
6. **Actions** — Users can delete, move, hardlink, symlink, rename, or optimize files.

### The Two Scanning Approaches

| Approach | Used By | How It Works |
|----------|---------|--------------|
| **DirTraversalBuilder** (builder pattern) | Duplicates, BigFiles, EmptyFiles, InvalidSymlinks, BadExtensions, BadNames, EXIF remover, BrokenFiles | Parallel directory walk with `rayon`, extension filtering, exclusion rules, grouping via closure |
| **Custom traversal** | EmptyFolder, Temporary, SimilarImages, SimilarVideos, SameMusic | Tool-specific parallel algorithms (e.g., recursive emptiness marking, BK-tree search, Chromaprint fingerprinting) |

---

## 5. Technology Stack

### Core

| Technology | Version | Usage |
|------------|---------|-------|
| [Rust](https://www.rust-lang.org/) | 1.92.0+ | All code; edition 2024; workspace resolver v3 |
| [rayon](https://crates.io/crates/rayon) | 1.10 | Parallel iterators for CPU-bound work |
| [crossbeam-channel](https://crates.io/crates/crossbeam-channel) | 0.5 | Inter-thread progress communication |
| [blake3](https://crates.io/crates/blake3) | 1.5 | Default hash algorithm for duplicate detection |
| [serde](https://crates.io/crates/serde) + [bincode](https://crates.io/crates/bincode) | 1.0 / <2.0 | Cache serialization |
| [Fluent](https://projectfluent.org/) / [i18n-embed](https://crates.io/crates/i18n-embed) | 0.16 | Internationalization |

### Image Processing

| Technology | Version | Usage |
|------------|---------|-------|
| [image-rs](https://crates.io/crates/image) | 0.25 | Decoding many image formats |
| [image_hasher](https://crates.io/crates/image_hasher) | 3.0 | Perceptual hashing (Mean, Gradient, Blockhash, etc.) |
| [bk-tree](https://crates.io/crates/bk-tree) | 0.5 | Similarity search for image hashes |
| [fast_image_resize](https://crates.io/crates/fast_image_resize) | 6.0 | Fast image resizing |
| [rawler](https://crates.io/crates/rawler) | 0.7 | RAW image decoding (pure Rust) |
| [libheif-rs](https://crates.io/crates/libheif-rs) | 2 (optional) | HEIC/HEIF decoding |
| [jxl-oxide](https://crates.io/crates/jxl-oxide) | 0.12 | JPEG XL decoding |

### Audio & Video

| Technology | Version | Usage |
|------------|---------|-------|
| [vid_dup_finder_lib](https://crates.io/crates/vid_dup_finder_lib) | 0.4 | Video fingerprinting |
| [lofty](https://crates.io/crates/lofty) | 0.24 | Audio tag reading |
| [rusty-chromaprint](https://crates.io/crates/rusty-chromaprint) | 0.3 | Audio fingerprinting |
| [symphonia](https://crates.io/crates/symphonia) | 0.5 | Audio decoding |
| [FFmpeg](https://ffmpeg.org/) (external) | — | Frame extraction, video probing, transcoding |

### Frontend Frameworks

| Framework | Used By | Version | Notes |
|-----------|---------|---------|-------|
| [Slint](https://slint.dev/) | Krokiet, Cedinia | 1.15.0 | Declarative UI; GPL-3.0; supports winit, Android, Skia, femtovg, software renderers |
| [GTK 4](https://gtk.org/) via [gtk4-rs](https://gtk-rs.org/) | czkawka_gui | 0.11.0 (v4_6) | Legacy; maintenance mode only |
| [axum](https://crates.io/crates/axum) | czkawka_web | 0.8 | HTTP framework with WebSocket support |
| [tokio](https://tokio.rs/) | czkawka_web | 1 (full) | Async runtime |

### CLI & Tooling

| Technology | Used By | Version | Purpose |
|------------|---------|---------|---------|
| [clap](https://crates.io/crates/clap) | czkawka_cli | 4.5 | CLI argument parsing (derive API) |
| [indicatif](https://crates.io/crates/indicatif) | czkawka_cli | 0.18 | Progress bar rendering |
| [just](https://just.systems/) | Project-wide | — | Command runner (`justfile`) |
| [ruff](https://docs.astral.sh/ruff/) | misc/ | 0.15.8 | Python linter/formatter |
| [mypy](https://mypy-lang.org/) | misc/ | 1.19.1 | Python static type checker |

---

## 6. Key Design Decisions

These principles are documented in [`AGENTS.md`](../AGENTS.md) and apply across the entire codebase:

### 6.1 Performance First

- All CPU-bound work is parallelized via `rayon`.
- Efficient algorithms used throughout: perceptual hashing, `blake3`, BK-tree similarity search.
- The [`DirTraversalBuilder`](../czkawka_core/src/common/dir_traversal.rs:39) uses parallel directory
  walks with `rayon` batches and `with_max_len(2)` to avoid checking too many folders at once.
- Extension checking is optimized — manual `rfind('.')` is 5× faster than `Path::extension()`.
- Cache serialization uses `bincode` (binary) for speed; JSON is an optional alternative.
- [`DelayedSender`](../czkawka_core/src/helpers/delayed_sender.rs:13) throttles progress updates
  to avoid flooding the channel.

### 6.2 Minimal Non-Rust Dependencies

- **Default build is fully pure-Rust.** Native libraries (`libheif`, `libraw`, `libavif`) are
  gated behind optional Cargo features.
- The only required external dependencies are FFmpeg/FFprobe (for video features) and platform
  libraries for the GTK GUI.
- [`rawler`](../czkawka_core/Cargo.toml) (pure Rust) is the default RAW decoder; `libraw-rs` is
  opt-in.
- [`rust-embed`](https://crates.io/crates/rust-embed) embeds all static assets (translations, web
  frontend) at compile time — no runtime file deployment.

### 6.3 `expect()` Over Silent Failures

- [`expect()`](../AGENTS.md#panics-and-expect) is preferred when a failed call would leave the
  program in an inconsistent state (e.g., upgrading a Slint weak reference that was just
  registered).
- `Result`/`Option` propagation is used for expected failures (I/O errors, missing files).
- `unwrap_or_default()` / `unwrap_or_else()` preferred over `unwrap()`.
- Never silently swallow errors with `let _ = ...` unless genuinely irrelevant.

### 6.4 `just fix` Quality Gate

Every merge request must pass `just fix`, which runs in order:

1. `ruff format` — Python formatting
2. `mypy misc --strict` — Python type checking
3. `bash misc/run_checks.sh` — 12 project-specific checks (unused imports, translations, callbacks, settings)
4. `cargo +nightly fmt` + `cargo fmt` — Rust formatting
5. `cargo clippy --fix` — Rust linting (two passes: with and without default features)

A non-zero exit or any stderr output means the code is not ready for review.

### 6.5 Build Profiles

| Profile | Use Case |
|---------|----------|
| `release` | Standard release (LTO off for faster iteration) |
| `fast_release` | Incremental, stripped — fast iteration |
| `rdebug` | Release + full debug symbols — profiling |
| `fastest` | Max opt, LTO, `panic=abort` — benchmarks |
| `fastci` | Small binary, fast CI builds |

### 6.6 Slint UI Conventions

- **Hidden `Text` for width measurement** — off-screen text elements compute `preferred-width`
  for translated labels that vary in length.
- **Enums over strings** — UI state with fixed values uses Slint `enum`, not `string`.
- **Global state** — Application-wide state lives in Slint `global` blocks.

### 6.7 Only Edit English `.ftl` Directly

All non-English translations are managed through [Crowdin](https://crowdin.com/) and are
overwritten on the next `just unpack_translations` run.

---

## 7. Tool Comparison Across Frontends

| Tool | Core Library | Krokiet | Cedinia | czkawka_cli | czkawka_gui | czkawka_web |
|------|:-----------:|:-------:|:-------:|:-----------:|:-----------:|:-----------:|
| Duplicate Files | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Similar Images | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Similar Videos | ✅ | ✅ | ❌¹ | ✅ | ✅ | ✅ |
| Same Music | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Empty Files | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Empty Folders | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Big Files | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Temporary Files | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Broken Files | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Bad Extensions | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Bad Names | ✅ | ✅ | ✅ | ✅ | ❌² | ❌ |
| Invalid Symlinks | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| EXIF Remover | ✅ | ✅ | ✅ | ✅ | ❌² | ❌ |
| Video Optimizer | ✅ | ✅ | ❌¹ | ✅ | ❌² | ❌ |

> ¹ Cedinia excludes video tools because FFmpeg is not available on Android.
> ² czkawka_gui (GTK4 legacy) excludes ExifRemover, VideoOptimizer, and BadNames — 11 of 14 tools.

**Legend:** ✅ Available | ❌ Not available

### Tool Counts Per Frontend

| Frontend | Tools |
|----------|:-----:|
| czkawka_core (library) | 14 |
| krokiet (Slint desktop) | 14 |
| czkawka_cli (CLI) | 14 |
| cedinia (Android) | 11 |
| czkawka_gui (GTK4 legacy) | 11 |
| czkawka_web (HTTP) | 3 |

---

## 8. File Action Matrix

Which file operations each frontend supports:

| Action | Krokiet | Cedinia | czkawka_cli | czkawka_gui | czkawka_web |
|--------|:-------:|:-------:|:-----------:|:-----------:|:-----------:|
| Permanently delete | ✅ | ✅ | ✅ | ✅ | ✅ |
| Move to trash | ✅ | ❌¹ | ✅ | ✅ | ❌ |
| Move files | ✅ | ❌ | ❌ | ✅ | ❌ |
| Rename files | ✅ | ✅ (bad names) | ✅ (bad names/extensions) | ❌ | ❌ |
| Hardlink files | ✅ | ❌ | ✅ | ✅ | ✅ |
| Symlink files | ✅ | ❌ | ❌ | ✅ | ❌ |
| Strip EXIF data | ✅ | ✅ | ✅ | ❌ | ❌ |
| Optimize videos | ✅ | ❌ | ✅ | ❌ | ❌ |

> ¹ Cedinia uses `std::fs::remove_file` directly (Android has no system trash).
> czkawka_cli supports trash via the `--move-to-trash` / `-y` flag.

---

## 9. Development Workflow

### 9.1 Building

```bash
# Build everything (debug)
cargo build

# Build a specific crate
cargo build -p krokiet
cargo build -p czkawka_cli

# Fast release build (incremental, stripped)
cargo build --profile fast_release -p krokiet

# Release build with full LTO
cargo build --profile release-lto -p krokiet

# Web build (self-contained binary)
just build-web
```

### 9.2 Running

```bash
# Via justfile (recommended)
just run krokiet          # debug
just runr krokiet         # fast_release
just run czkawka_cli      # CLI debug
just runr czkawka_cli     # CLI fast_release
just run-web              # Web debug
just runr-web             # Web fast_release

# Direct cargo
cargo run --bin krokiet
cargo run --profile fast_release --bin czkawka_cli -- dup -d /path

# Android
just android              # build + install + launch
just androidr             # release variant
```

### 9.3 Testing

```bash
# Unit tests
cargo test -p czkawka_core
cargo test -p krokiet

# Integration tests (requires TestFiles.zip)
just itests

# Benchmarks
just bench                # Criterion benchmarks in czkawka_core
```

### 9.4 Code Quality

```bash
# Full quality gate (must pass before merge)
just fix

# Just formatting
cargo fmt
cargo +nightly fmt

# Just linting
just clip                 # Two clippy passes

# Validate translations
just validate_translations --fix
```

### 9.5 Translation Workflow

```bash
# Add new keys to English .ftl files only, then:
just translate                         # AI-translate all projects
just validate_translations --fix       # Validate placeholders

# Crowdin sync
just pack_translations                 # Create Crowdin upload zip
just unpack_translations <path>        # Unpack downloaded translations
```

> **Important:** Only edit `i18n/en/` files directly. Other languages are overwritten on Crowdin sync.

### 9.6 Profiling & Analysis

```bash
just samplyrd bin=krokiet *args        # CPU profiling (rdebug)
just val bin=czkawka_cli               # Valgrind memory check
just heaptrack bin=krokiet             # Heap profiling
just bloat_by_function                 # Largest functions
just dependencies_graph                # Dependency graph (PNG)
```

### 9.7 CI/CD Overview

| Platform | Workflow (`./github/workflows/`) | Builds |
|----------|----------------------------------|--------|
| Linux | [`linux.yml`](../.github/workflows/linux.yml) | x86_64, ARM64, MUSL, 32-bit; multiple Krokiet backend variants |
| Windows | [`windows.yml`](../.github/workflows/windows.yml) | MSVC native + MinGW cross-compile |
| macOS | [`mac.yml`](../.github/workflows/mac.yml) | x86_64 + ARM64 |
| Android | [`android.yml`](../.github/workflows/android.yml) | APK + AAB (min SDK 26, target 35) |
| Quality | [`quality.yml`](../.github/workflows/quality.yml) | `cargo fmt --check` + `cargo clippy -D warnings` |

Nightly releases are produced from the `master` branch using `softprops/action-gh-release`.

---

## 10. Dependencies Overview

### 10.1 Core Scanning Dependencies

| Crate | Version | Purpose | Tool(s) |
|-------|---------|---------|---------|
| [`rayon`](https://crates.io/crates/rayon) | 1.10 | Parallel iterators | All |
| [`crossbeam-channel`](https://crates.io/crates/crossbeam-channel) | 0.5 | Progress reporting | All |
| [`blake3`](https://crates.io/crates/blake3) | 1.5 | Default hash algorithm | Duplicates |
| [`crc32fast`](https://crates.io/crates/crc32fast) | 1.4 | Alternative hash (CRC32) | Duplicates |
| [`xxhash-rust`](https://crates.io/crates/xxhash-rust) | 0.8 (xxh3) | Alternative hash (XXH3) | Duplicates |
| [`image-rs`](https://crates.io/crates/image) | 0.25 | Image decoding | SimilarImages, BrokenFiles, BadExtensions |
| [`image_hasher`](https://crates.io/crates/image_hasher) | 3.0 | Perceptual hashing | SimilarImages |
| [`bk-tree`](https://crates.io/crates/bk-tree) | 0.5 | Similarity search | SimilarImages |
| [`fast_image_resize`](https://crates.io/crates/fast_image_resize) | 6.0 | Image resizing | SimilarImages |
| [`vid_dup_finder_lib`](https://crates.io/crates/vid_dup_finder_lib) | 0.4 | Video fingerprinting | SimilarVideos |
| [`lofty`](https://crates.io/crates/lofty) | 0.24 | Audio tag reading | SameMusic |
| [`rusty-chromaprint`](https://crates.io/crates/rusty-chromaprint) | 0.3 | Audio fingerprinting | SameMusic |
| [`symphonia`](https://crates.io/crates/symphonia) | 0.5 | Audio decoding | SameMusic, BrokenFiles |
| [`rawler`](https://crates.io/crates/rawler) | 0.7 | RAW image decoding | SimilarImages |
| [`infer`](https://crates.io/crates/infer) | 0.19 | MIME type detection | BadExtensions |
| [`little_exif`](https://crates.io/crates/little_exif) | 0.6 | EXIF reading/writing | EXIF Remover |
| [`nom-exif`](https://crates.io/crates/nom-exif) | 2.1 | EXIF orientation | SimilarImages |
| [`serde`](https://crates.io/crates/serde) + [`bincode`](https://crates.io/crates/bincode) | 1.0 / <2.0 | Cache serialization | Duplicates, SimilarImages, SimilarVideos, BrokenFiles |
| [`zip`](https://crates.io/crates/zip) | 8.1 | Archive validation | BrokenFiles |
| [`lopdf`](https://crates.io/crates/lopdf) | 0.40 | PDF validation | BrokenFiles |
| [`trash`](https://crates.io/crates/trash) | 5.1 | System trash support | All (desktop) |

### 10.2 Frontend-Specific Dependencies

| Crate | Krokiet | Cedinia | czkawka_cli | czkawka_gui | czkawka_web |
|-------|:-------:|:-------:|:-----------:|:-----------:|:-----------:|
| [`slint`](https://crates.io/crates/slint) 1.15.0 | ✅ | ✅ | — | — | — |
| [`gtk4`](https://crates.io/crates/gtk4) 0.11.0 | — | — | — | ✅ | — |
| [`axum`](https://crates.io/crates/axum) 0.8 | — | — | — | — | ✅ |
| [`tokio`](https://crates.io/crates/tokio) 1 | — | — | — | — | ✅ |
| [`clap`](https://crates.io/crates/clap) 4.5 | — | — | ✅ | — | — |
| [`indicatif`](https://crates.io/crates/indicatif) 0.18 | — | — | ✅ | — | — |
| [`rfd`](https://crates.io/crates/rfd) 0.17 | ✅ | ✅ (desktop) | — | — | — |
| [`rodio`](https://crates.io/crates/rodio) 0.22 | ✅ (optional) | — | — | — | — |
| [`notify-rust`](https://crates.io/crates/notify-rust) 4 | ✅ | ✅ (desktop) | — | — | — |
| [`android-activity`](https://crates.io/crates/android-activity) 0.6 | — | ✅ | — | — | — |
| [`jni`](https://crates.io/crates/jni) 0.22 | — | ✅ | — | — | — |
| [`copypasta`](https://crates.io/crates/copypasta) 0.10 | ✅ | — | — | — | — |
| [`fontique`](https://crates.io/crates/fontique) 0.8 | ✅ | — | — | — | — |
| [`uuid`](https://crates.io/crates/uuid) 1 | — | — | — | — | ✅ |
| [`tower-http`](https://crates.io/crates/tower-http) 0.6 | — | — | — | — | ✅ |
| [`rust-embed`](https://crates.io/crates/rust-embed) 8 | ✅ | ✅ | — | ✅ | ✅ |

### 10.3 Feature Flags

| Feature | Effect | Where |
|---------|--------|-------|
| `heif` | HEIC/HEIF image decoding via `libheif-rs` | czkawka_core (forwarded) |
| `libraw` | RAW decoding via `libraw-rs` (native) instead of `rawler` | czkawka_core (forwarded) |
| `libavif` | AVIF image support | czkawka_core (forwarded) |
| `blake_pure` | Pure Rust blake3 (no SIMD intrinsics) | czkawka_core |
| `xdg_portal_trash` | Trash via xdg-desktop-portal (Flatpak) | czkawka_core (forwarded) |
| `audio` | Scan-completion sound via `rodio` | krokiet |
| `skia_opengl` / `skia_vulkan` / `software` / `femtovg` | Slint renderer backends | krokiet, cedinia |
| `no_colors` | Disable colored CLI help | czkawka_cli |

---

## 11. Related Documentation

### 11.1 Workspace Configuration

- [Top-level structure & Cargo.toml](01-top-level-structure.md) — profiles, lints, CI/CD, justfile, data files
- [`AGENTS.md`](../AGENTS.md) — Coding guidelines (language, comments, panics, quality gate)
- [`.rustfmt.toml`](../.rustfmt.toml) — Rust formatting config (max_width: 180, Module imports)
- [`clippy.toml`](../clippy.toml) — Clippy configuration (unwrap allowed in tests)
- [`justfile`](../justfile) — All available commands (build, run, fix, translate, android, web, profiling)
- [`.cargo/config.toml`](../.cargo/config.toml) — Windows MSVC stack size (8 MB)

### 11.2 User Documentation

- [`instructions/Instruction.md`](../instructions/Instruction.md) — Comprehensive user manual covering all tools, workflows, config/cache locations
- [`instructions/Translations.md`](../instructions/Translations.md) — Translation contribution guide

### 11.3 Implementation Plans

- [`plans/czkawka_web_server.md`](../plans/czkawka_web_server.md) — Original web server implementation plan
- [`plans/czkawka_web_self_contained.md`](../plans/czkawka_web_self_contained.md) — Self-contained binary plan (implemented)
- [`plans/czkawka_web_result_perf.md`](../plans/czkawka_web_result_perf.md) — Results rendering performance optimization (event delegation + pagination)

### 11.4 Internationalization

- [Full i18n system documentation](09-i18n-system.md) — Fluent structure, macros, key counts, 27 languages, Crowdin workflow
- Key editing rule: **Only edit `i18n/en/` files** — other languages are overwritten on Crowdin sync

### 11.5 Changelog

- [`Changelog.md`](../Changelog.md) — Documents changes up to v11.0.1 and upcoming unreleased changes

---

*For complete details on any topic, follow the links to the appropriate sub-document above.*

---

## 12. Verification Notes

*Verification performed: 2026-06-29 against verified sub-documents (01, 02, 03, 04, 07) and source code.*

### What was checked

| Area | Sources Verified | Result |
|---|---|---|
| Tool comparison matrix (14 tools) | [`czkawka_core/src/tools/mod.rs`](../czkawka_core/src/tools/mod.rs), [`krokiet/src/connect_scan/`](../krokiet/src/connect_scan/), [`czkawka_web/src/api/scan.rs`](../czkawka_web/src/api/scan.rs), [`docs/04-cedinia.md`](04-cedinia.md#6-scan-tool-implementations--srcscannersrs) | All tool counts match source. One correction made (see below). |
| File action matrix | [`krokiet/src/file_actions/`](../krokiet/src/file_actions/), [`czkawka_web/src/api/actions.rs`](../czkawka_web/src/api/actions.rs) | All action flags confirmed correct. |
| Technology stack versions | [`krokiet/Cargo.toml`](../krokiet/Cargo.toml), [`czkawka_web/Cargo.toml`](../czkawka_web/Cargo.toml), [`czkawka_gui/Cargo.toml`](../czkawka_gui/Cargo.toml) | Slint 1.15.0, axum 0.8, GTK4 0.11.0 (v4_6), tokio 1 (full) — all confirmed. |
| Development workflow | [`justfile`](../justfile), [`.github/workflows/`](../.github/workflows/) | All `just` commands referenced exist. All 5 CI workflow files match (linux, windows, mac, android, quality). |
| Build profiles | [`docs/01-top-level-structure.md`](01-top-level-structure.md) | All 5 listed profiles match. |
| Architecture diagram tool counts | Sub-documents 02, 03, 04, 07 | Krokiet 14, Cedinia 11, CLI 14, GTK 11, Web 3 — all correct. |
| Slint file counts | [`krokiet/ui/`](../krokiet/ui/) listing | 21 main + 18 popup = 39 total. One correction made (see below). |
| Krokiet icons | [`krokiet/icons/`](../krokiet/icons/) listing | 33 SVG icons — matches sub-doc 03. |
| Krokiet i18n | [`krokiet/i18n/`](../krokiet/i18n/) | 27 language directories — matches sub-doc 03. |
| czkawka_web scan endpoints | [`czkawka_web/src/api/scan.rs`](../czkawka_web/src/api/scan.rs) | 5 handlers (duplicates, hardlink, similar-images, similar-videos, stop) — matches sub-doc 07. |
| All relative links | Sub-document markdown files | All 9 sub-document links resolve correctly. |

### Corrections made

| # | Location | Issue | Fix |
|---|----------|-------|-----|
| 1 | Quick-nav table, krokiet row (line 75) | Said "22 Slint files" — the verified sub-doc 03-krokiet and the actual [`krokiet/ui/`](../krokiet/ui/) directory listing both confirm 21 main Slint files (not 22). | Changed "22 Slint files" → "21 Slint files". |
| 2 | Architecture diagram, krokiet box (line 102) | Said "~22 .slint files" — same root cause as #1. | Changed "~22 .slint" → "~21 .slint". |
| 3 | Tool comparison matrix, Invalid Symlinks row (line 274) | Cedinia was marked ✅ for Invalid Symlinks, but the verified sub-doc [`04-cedinia.md`](04-cedinia.md) section 6 lists only 11 scanners and `invalid_symlinks` is not among them. Cedinia excludes `similar_videos`, `video_optimizer`, and `invalid_symlinks` — 11 tools total. | Changed cedinia column from ✅ → ❌. |

### Confirmed accurate (no changes needed)

- All 14 tool names in the comparison matrix match [`czkawka_core/src/tools/mod.rs`](../czkawka_core/src/tools/mod.rs).
- Krokiet has all 14 tools (14 files in [`krokiet/src/connect_scan/`](../krokiet/src/connect_scan/)).
- czkawka_web has 3 distinct tools (Duplicates, SimilarImages, SimilarVideos — hardlink is a DuplicateFinder mode, not a separate tool).
- File action matrix: krokiet has all 8 actions (7 Rust files in [`krokiet/src/file_actions/`](../krokiet/src/file_actions/)), czkawka_web has delete + hardlink only.
- All technology version numbers (Slint 1.15.0, axum 0.8, GTK4 0.11.0, etc.) match their respective Cargo.toml files.
- All 5 CI/CD workflow file names in section 9.7 match the actual [`.github/workflows/`](../.github/workflows/) directory.
- Architecture diagram tool counts: 14 (krokiet), 11 (cedinia), 14 (CLI), 11 (GTK), 3 (web) — all correct.
- The Data Flow and Two Scanning Approaches sections accurately reflect `czkawka_core` architecture.
- Key Design Decisions section matches [`AGENTS.md`](../AGENTS.md).
- All dependency tables (core scanning, frontend-specific, feature flags) cross-reference correctly with crate Cargo.toml files.
- All links in "Related Documentation" section resolve to existing files.
- Development Workflow commands all exist in [`justfile`](../justfile).
