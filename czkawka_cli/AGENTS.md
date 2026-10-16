# czkawka_cli – Architecture Guide

## Overview

`czkawka_cli` is a thin CLI wrapper around `czkawka_core`. It handles argument
parsing, thread orchestration, progress rendering, and result output. All
scanning logic lives in `czkawka_core`; this crate only wires it to the
terminal.

---

## Source Layout

- `src/main.rs:54` — entry point, thread spawning, tool dispatchers.
- `src/commands.rs:39` (`Commands`) / `src/commands.rs:808` (`CommonCliItems`) — all clap argument definitions.
- `src/progress.rs` — indicatif progress bar rendering.

---

## Execution Model

`main()` (`src/main.rs:54`) parses the args (clap), creates the crossbeam channel and the `stop_flag`,
spawns one calculation thread that dispatches to one of the 14 tool functions, registers the Ctrl+C
handler, blocks in `connect_progress(&progress_receiver)` while the scan runs, then joins the calculation
thread, prints the output and exits with 11 if items were found.

The **main thread** renders progress. The **calculation thread** runs the scan.
`progress_receiver.recv()` exits naturally when the sender drops (scan ends).

---

## CLI Subcommands

Defined via `clap` derive in `commands.rs`. Top-level enum `Commands` has 14
variants:

| Subcommand        | Alias            | Purpose                                 |
|-------------------|------------------|-----------------------------------------|
| `Duplicates`      | `dup`            | Find duplicate files (hash/name/size)   |
| `EmptyFolders`    | `empty-folders`  | Find empty directories                  |
| `BiggestFiles`    | `big`            | Find biggest or smallest files          |
| `EmptyFiles`      | `empty-files`    | Find zero-byte files                    |
| `Temporary`       | `temp`           | Find temporary files                    |
| `SimilarImages`   | `image`          | Find similar images (perceptual hash)   |
| `SameMusic`       | `music`          | Find duplicate music (tags/fingerprint) |
| `InvalidSymlinks` | `symlinks`       | Find broken symlinks                    |
| `BrokenFiles`     | `broken`         | Find broken PDF/audio/image/archive     |
| `SimilarVideos`   | `video`          | Find similar videos (frame hashing)     |
| `BadExtensions`   | `ext`            | Find files with wrong extensions        |
| `BadNames`        | `bad-names`      | Find problematic file names             |
| `VideoOptimizer`  | `video-optimizer`| Transcode or crop videos                |
| `ExifRemover`     | `exif-remover`   | Remove EXIF metadata from images        |

### `CommonCliItems` (shared by every subcommand)

- `-d` directories (required)
- `-e` excluded directories
- `-E` excluded items (glob patterns, e.g. `*/.*`)
- `-x` allowed extensions (supports macros: `IMAGE`, `VIDEO`, `MUSIC`, `TEXT`)
- `-P` excluded extensions
- `-R` disable recursive search
- `-X` (unix only) exclude other filesystems
- `-f` save text results to file
- `-C` save compact JSON results to file
- `--pretty-json-file-to-save` save pretty JSON results to file
- `-N` / `-M` suppress result/message output
- `-W` suppress non-zero exit code when items found
- `-T` thread count (0 = all CPUs)
- `-H` disable cache

### Delete methods

**`DMethod`** (for similarity-grouping tools): `-D NONE|AEN|AEO|ON|OO|AEB|AES|OB|OS|HARD`
**`SDMethod`** (for simple tools): `-D` delete flag, `-Q` dry-run, `-y` move-to-trash

---

## Tool Dispatcher Pattern

Every one of the 14 dispatch functions follows the same structure:

Each dispatcher takes the tool args, the `stop_flag` and the progress sender, and returns a `CliOutput`.
The steps are always the same: destructure the args → build the tool-specific parameter struct → apply the
common settings → apply the tool-specific settings (file sizes, delete method, …) → run
`tool.search(stop_flag, Some(progress_sender))` → optionally run the fix step (rename/delete/…) → return
`save_and_write_results_to_writer(&tool, &common_cli_items)`.

`set_common_settings` applies paths, recursion, extensions, cache flags, and
thread count via the `AllTraits` bound.

---

## Progress Rendering (`progress.rs`)

`connect_progress(&progress_receiver)` loops on `progress_receiver.recv()` and
renders via indicatif:

- **Spinner** while collecting files or loading/saving cache.
- **Linear bar** `[=>  ]` once the total entry or byte count is known.

The stage label (e.g. "Calculating hashes", "Reading tags") is derived from the
`CurrentStage` enum on each `ProgressData` message.

---

## Result Output

`save_and_write_results_to_writer` writes three optional file formats (text,
compact JSON, pretty JSON) and buffers stdout output, which is printed after the
thread join. The `CliOutput.found_any_files` flag drives the exit code:

- `exit(11)` when items are found (and `-W` is not set) — useful in scripts.
- `exit(0)` otherwise.

---

## Cancellation

`Arc<AtomicBool>` (SeqCst ordering) is shared between the Ctrl+C signal handler
and the calculation thread. The tools in `czkawka_core` poll it during scanning
and stop gracefully when it is `true`.

---

## Key Dependencies

| Crate              | Purpose                          |
|--------------------|----------------------------------|
| `clap` 4.5         | CLI parsing (derive API)         |
| `indicatif` 0.18   | Progress bars                    |
| `crossbeam-channel`| Unbounded channel for progress   |
| `ctrlc` 3.4        | SIGINT / Ctrl+C handling         |
| `humansize` 2.1    | Human-readable byte sizes        |
| `czkawka_core`     | All scanning logic               |

### Optional features (forwarded to `czkawka_core`)

- `heif` – HEIF/HEIC image support (requires libheif)
- `libraw` – RAW image support (requires libraw)
- `libavif` – AVIF image support (requires libavif)
- `xdg_portal_trash` – FlatPak-compatible trash (XDG portal)

---

## Child DOX Index

None (leaf node — only 3 source files, no sub-directory boundaries).
