# Building Cadence

Notes for working on Cadence itself, here so that a machine set up from
scratch, or a decision made a year ago, does not have to be reconstructed from
memory.

## Getting set up

You will need [Node.js](https://nodejs.org) 22 or newer, the
[Rust toolchain](https://rustup.rs), and the Visual Studio C++ build tools.

```bash
npm install
npm run app:dev
```

For interface work that does not touch the desktop shell, `npm run dev` serves
the frontend on its own and reloads far faster.

## Before pushing

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

## What Cadence is

A narrow shape, kept deliberately. These are the rules a feature is measured
against, and they are worth rereading before adding one.

- **Keyboard first.** Anything reachable by mouse should be reachable by key.
- **No network for playback.** Files are read from disk and stay there. Online
  subtitle search is the single exception, and it is opt-in.
- **Nothing between the user and the frame.** No accounts, no telemetry, no
  update nag that interrupts a film.

The third one is the one to watch. Sync and a phone app both push against it,
and "no accounts" is a promise the desktop player has made to everyone using it
today. Whatever an account turns out to be, playing a file off a disk should
never be the thing that requires one.
