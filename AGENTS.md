# Czkawka – Codebase Guide

## Language

All code, comments, commit messages, and documentation must be written in **English**.

---

## Comments

Keep comments minimal. Code should be self-documenting through clear naming. Add a comment only
when the _why_ is not obvious from reading the code – algorithmic choices, non-obvious constraints,
workarounds for external library bugs, etc. Do not restate what the code already says.

---

## Panics and `expect()`

`expect()` (and `unwrap()` but only in tests) are acceptable and **preferred** over silently ignoring a failure when
a failed call would leave the program in an inconsistent or corrupted state. This is visible
throughout Krokiet's callback code: the Slint weak reference is upgraded with `expect()` because
if the window is already gone there is nothing meaningful to do except crash.

Rules of thumb:
- Use `expect()` for logic invariants – things that _cannot_ fail unless there is a programming
  error (e.g. "failed to upgrade MainWindow weak ref in callback that was just registered").
- Use proper `Result`/`Option` propagation for _expected_ failures (I/O errors, missing files,
  user-cancellable operations).
- Never silently swallow errors with `let _ = ...` unless the failure is genuinely irrelevant.
- Prefer `unwrap_or_default()` / `unwrap_or_else()` over `unwrap()` when a sensible fallback
  exists.

---

## Project Goals

Two properties are non-negotiable across every sub-project:

1. **Performance first** – scanning and file operations must be fast. Parallelism via `rayon`,
   efficient algorithms (e.g. perceptual hashing, blake3), and careful memory use are the norm.
   Avoid unnecessary allocations or copies in hot paths.

2. **Minimal non-Rust dependencies** – every additional C/C++ library (or any other non-Rust
   language) makes cross-compilation harder, narrows the set of supported targets, and increases
   build complexity for contributors. Prefer pure-Rust crates. If a native library is truly
   necessary (e.g. `libheif`, `libraw`), gate it behind an optional Cargo feature so the default
   build stays fully Rust.

---

## `just fix` – baseline quality gate

Running `just fix` must pass before any merge request. It runs, in order:

1. `ruff format` – Python code formatting.
2. `mypy misc --strict` – static type checking for all scripts in `misc/`.
3. `bash misc/run_checks.sh` – project-specific checks:
   - `delete_unused_krokiet_slint_imports.py` for krokiet and cedinia
   - `find_unused_fluent_translations.py` for all four projects
   - `find_unused_slint_translations.py` for krokiet and cedinia
   - `find_unused_callbacks.py` for krokiet and cedinia
   - `find_unused_settings_properties.py` for krokiet and cedinia
4. `cargo +nightly fmt` + `cargo fmt` – Rust formatting.
5. `cargo clippy --fix` – Rust linting (two passes: with and without default features).

If `just fix` produces any output on stderr or exits non-zero the code is not ready for review.

---

## Line endings

Tracked text files use Unix (LF) line endings, enforced by the root `.gitattributes` (`*.rs text eol=lf`, plus web assets). This matches the `newline_style = "Unix"` setting in `.rustfmt.toml`, so `cargo fmt --check` never fails on CRLF checkouts.

---

## Workspace Structure

```
czkawka/
├── czkawka_core/   # Scanning logic – shared library used by all frontends
├── czkawka_cli/    # Command-line interface
├── czkawka_gui/    # Legacy GTK 4 GUI (maintenance mode only)
├── czkawka_web/    # Web frontend – axum + vanilla JS, self-contained binary
├── krokiet/        # Primary desktop GUI – Slint-based
├── cedinia/        # Android / mobile GUI – Slint-based
└── misc/           # Scripts: AI translation, validation, benchmarks, CI helpers
```

Cargo workspace resolver v3, minimum Rust 1.92.0, edition 2024 throughout.

---

## Crate documentation

Root keeps only project-wide rules: language, comments, panic policy, project goals, the `just fix`
quality gate, line endings, i18n, Slint UI conventions, build profiles and the justfile reference.
Each crate's internals — architecture, source layout, local contracts, work guidance and
verification — live in that crate's own AGENTS.md; see the Child DOX Index at the end of this file.

---

## i18n

All user-visible strings use [Fluent](https://projectfluent.org/) (`.ftl` files).

| Project      | Macro  | File pattern                                |
|--------------|--------|---------------------------------------------|
| krokiet      | `flk!` | `krokiet/i18n/<lang>/krokiet.ftl`           |
| cedinia      | `flc!` | `cedinia/i18n/<lang>/cedinia.ftl`           |
| czkawka_core | `flc!` | `czkawka_core/i18n/<lang>/czkawka_core.ftl` |
| czkawka_gui  | `flg!` | `czkawka_gui/i18n/<lang>/czkawka_gui.ftl`   |

English is the source/fallback language. All other locales are AI-translated and then validated.

**Important:** Only edit the English `.ftl` files (`i18n/en/`) directly in this repository.
All other language files are managed through [Crowdin](https://crowdin.com/) and will be
**overwritten** when translations are pulled from Crowdin. Any manual edits to non-English
`.ftl` files in the repo will be lost on the next `just unpack_translations` run.

---

## Slint UI conventions

- **Hidden Text elements for width measurement** – where a layout element must adapt its width to
  translated label text, add off-screen `Text` instances (`x: -10000px; y: -10000px; height: 0`)
  and compute `preferred-width` at runtime (see `LeftSidePanel`, `CompareInfoBar`).
- **Enums over strings** – UI state that takes a fixed set of values should use a Slint `enum`, not
  a `string` (e.g. `ConfirmPopupAction`, `ActiveTool`, `ScanState`).
- **Global state** – Application-wide state lives in Slint `global` blocks (`GuiState`,
  `AppState`, `Settings`, `Translations`, …). Rust reads/writes via `app.global::<GlobalName>()`.

---

## Build profiles (Cargo.toml)

| Profile        | Purpose                                                              |
|----------------|----------------------------------------------------------------------|
| `release`      | Standard release                                                     |
| `fast_release` | Incremental, stripped – fast iteration                               |
| `rdebug`       | Release + full debug symbols (profiling)                             |
| `fastest`      | Max opt, LTO, panic=abort – mostly benchmarks/poc how fast it can be |
| `fastci`       | Small binary, fast CI builds                                         |

---

## justfile quick reference

```
just run krokiet          # debug run
just runr krokiet         # fast_release run
just fix                  # format + clippy + Python checks
just translate            # AI-translate all projects
just validate_translations [--fix]
just pack_translations    # create i18n_translations.zip for Crowdin
just unpack_translations <path>
just android              # build + install + launch on device
just androidr             # release variant
just run-web              # debug run web frontend
just runr-web             # fast_release run web frontend
just docker-web           # Docker build web frontend
```
---

# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

- Web UI work targets the **modern UI** ([`czkawka_web/web/v2/`](czkawka_web/web/v2/)) by default.
  The **classic** UI ([`czkawka_web/web/`](czkawka_web/web/)) is maintenance-only and is modified
  only when the user explicitly asks for it.
- When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Child DOX Index

| Path | AGENTS.md | Scope | Type |
|------|-----------|-------|------|
| [`czkawka_core/`](czkawka_core/) | [`czkawka_core/AGENTS.md`](czkawka_core/AGENTS.md) | Shared scanning engine — 14 tools, common infrastructure, no UI | Leaf |
| [`krokiet/`](krokiet/) | [`krokiet/AGENTS.md`](krokiet/AGENTS.md) | Primary desktop GUI — Slint-based, 14 tools, GPL-3.0 | Leaf |
| [`cedinia/`](cedinia/) | [`cedinia/AGENTS.md`](cedinia/AGENTS.md) | Android / mobile GUI — Slint-based, 11 tools, JNI, GPL-3.0 | Leaf |
| [`czkawka_cli/`](czkawka_cli/) | [`czkawka_cli/AGENTS.md`](czkawka_cli/AGENTS.md) | CLI frontend — clap + indicatif, 14 tools, MIT | Leaf |
| [`czkawka_gui/`](czkawka_gui/) | [`czkawka_gui/AGENTS.md`](czkawka_gui/AGENTS.md) | Legacy GTK 4 GUI — maintenance mode only, 11 tools, MIT | Leaf |
| [`czkawka_web/`](czkawka_web/) | [`czkawka_web/AGENTS.md`](czkawka_web/AGENTS.md) | Web frontend — axum + vanilla JS, 4 tools, self-contained binary | Leaf |
| [`misc/`](misc/) | [`misc/AGENTS.md`](misc/AGENTS.md) | Supporting scripts — AI translation, validation, CI helpers, benchmarks | Leaf |

Directories without child AGENTS.md (not durable boundaries):
- [`data/`](data/) — Linux desktop integration files (`.desktop`, AppStream, icons)
- [`docs/`](docs/) — Project documentation ([`docs/README.md`](docs/README.md) is the master index)
- [`instructions/`](instructions/) — User documentation (manual, translation guide)
- [`plans/`](plans/) — Archived implementation plans
- [`ci_tester/`](ci_tester/) — Minimal CLI integration test runner
- [`.cargo/`](.cargo/) — Cargo config (`config.toml`)
- [`.github/`](.github/) — CI/CD workflows and issue templates
