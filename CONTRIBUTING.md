# Contributing

## Getting set up

You will need [Node.js](https://nodejs.org) 22 or newer, the
[Rust toolchain](https://rustup.rs), and the Visual Studio C++ build tools.

```bash
npm install
npm run app:dev
```

For interface work that does not touch the desktop shell, `npm run dev` serves
the frontend on its own and reloads far faster.

## Before opening a pull request

```bash
npm run typecheck
npm run build
cargo fmt --all --check      # from src-tauri/
cargo clippy --all-targets -- -D warnings
```

CI runs all four. It is quicker to find out locally.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):
`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `chore:`. The changelog is
written from them, so the subject line is read by people, not just by tooling.

## What makes a change likely to be merged

Cadence has a narrow shape and keeps it deliberately.

- **Keyboard first.** Anything reachable by mouse should be reachable by key.
- **No network for playback.** Files are read from disk and stay there. Online
  subtitle search is the single exception, and it is opt-in.
- **Nothing between the user and the frame.** No accounts, no telemetry, no
  update nag that interrupts a film.

A feature that fits those and does one thing well is worth opening. If you are
unsure, open an issue before writing the code; it is a cheaper conversation
than a closed pull request.
