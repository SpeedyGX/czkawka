# misc – Architecture Guide

## Purpose

The `misc/` directory holds supporting scripts and auxiliary Rust crates that are not part
of the main Czkawka workspace. These handle AI-powered translation, code quality validation,
CI packaging, Docker/Nix infrastructure, and performance benchmarks.

---

## Ownership

Owned collectively by the project. Scripts are maintained alongside the code they validate.
No single crate or module boundary — each sub-directory is an independent tool.

---

## Local Contracts

### Python scripts

- **Python 3.13** required (see [`pyproject.toml`](pyproject.toml)).
- **`ruff` formatting** and **`mypy --strict`** type checking enforced by `just fix`.
- All scripts must pass `mypy misc --strict` with zero errors before merge.
- Dependencies: `ruff`, `mypy`, `fluent.syntax`, `ollama`, `pandas-stubs`.

### Shell scripts

- Run under `bash`. Must be executable and pass [`run_checks.sh`](run_checks.sh) when
  referenced by it.

### Auxiliary Rust crates

- Standalone `Cargo.toml` files in sub-directories (e.g., `test_compilation_speed_size/`,
  `test_image_perf/`, `test_read_perf/`, `add_icon_exe/`). These are **not** workspace
  members — build them separately with `cargo build` from within each crate directory.

---

## Work Guidance

### AI Translation Pipeline

[`ai_translate/translate.py`](ai_translate/translate.py) uses Ollama to batch-translate
Fluent (`.ftl`) files into all supported languages. [`ai_translate/validate_translations.py`](ai_translate/validate_translations.py)
checks placeholder consistency. Run with:

```bash
just translate                   # AI-translate all projects
just validate_translations --fix # Validate + auto-fix placeholder issues
```

### Code Quality Checks

[`run_checks.sh`](run_checks.sh) is the master validation script invoked by `just fix`.
It runs, in order:

1. [`delete_unused_krokiet_slint_imports.py`](delete_unused_krokiet_slint_imports.py) — krokiet + cedinia
2. [`find_unused_fluent_translations.py`](find_unused_fluent_translations.py) — all four Fluent-using projects
3. [`find_unused_slint_translations.py`](find_unused_slint_translations.py) — krokiet + cedinia
4. [`find_unused_callbacks.py`](find_unused_callbacks.py) — krokiet + cedinia
5. [`find_unused_settings_properties.py`](find_unused_settings_properties.py) — krokiet + cedinia

Any non-zero exit means dead code exists.

### Packaging

- [`pack_all_backends.sh`](pack_all_backends.sh) / [`pack_all_backends.ps1`](pack_all_backends.ps1) — multi-platform binary packaging.
- [`flathub.sh`](flathub.sh) — FlatHub release preparation.
- [`gen_cedinia_licenses.py`](gen_cedinia_licenses.py) — generates `THIRD_PARTY_LICENSES.txt` from Cargo metadata.

### Build Helpers

- [`cargo/PublishCore.sh`](cargo/PublishCore.sh) — publish `czkawka_core` to crates.io.
- [`cargo/PublishOther.sh`](cargo/PublishOther.sh) — publish remaining workspace crates.
- [`docker/Dockerfile`](docker/Dockerfile) — CI/testing Docker image.
- [`nix/flake.nix`](nix/flake.nix) / [`nix/packages.nix`](nix/packages.nix) — Nix flake for reproducible builds.

### Benchmarks & Perf Tests

- `test_compilation_speed_size/` — Measures compile time and binary size across toolchains.
  Has its own [`README.md`](test_compilation_speed_size/README.md).
- `test_image_perf/` — Benchmarks image hashing performance.
- `test_read_perf/` — Benchmarks filesystem read performance.

These crates are not workspace members. Build individually from within each directory.

### Icon Utilities

- [`gen_android_icons.py`](gen_android_icons.py) — Generate Android adaptive icons.
- [`simplify_and_minify_svg.py`](simplify_and_minify_svg.py) — Minify SVG icons.
- [`add_icon_exe/`](add_icon_exe/) — Rust crate that embeds an icon into a Windows `.exe`.

---

## Verification

- **Python:** `ruff format` (formatting) + `mypy misc --strict` (type checking).
- **Shell:** [`run_checks.sh`](run_checks.sh) invoked by `just fix`.
- **Rust crates:** Standard `cargo fmt` / `cargo clippy` when built individually (not
  covered by workspace-level `just fix`).
- **Translation validation:** [`validate_translations.py`](ai_translate/validate_translations.py)
  with `--fix` flag.

---

## Child DOX Index

None (leaf node — sub-directories are internal tools, not durable boundaries warranting
their own AGENTS.md).
