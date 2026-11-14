# lodestar

A desktop app that teaches one reasoning step at a time, using the AI command line tool you already have. It is inspired by LearnHarness, which it does not copy.

## How a lesson works

A lesson has four parts. First it probes what you already know with a few questions. Then it plans a path of steps toward your goal. Then it teaches each step with three kinds of exercise: predict, explain and check. Finally it finishes the lesson and summarises what you learned.

Items you learn are saved to a knowledge list. Later lessons read that list.

## Requirements

- macOS. Other systems are untested.
- Node 26 and npm 11.
- The Codex CLI, installed and signed in. `codex --version` should print a version.

## Run it

```
npm ci
npm run dev
```

If the window does not open and the log says `Electron uninstall`, run `node node_modules/electron/install.js` once. npm may skip Electron's own download.

## Your data

Lessons are JSON files under the app's data folder. On macOS this is `~/Library/Application Support/lodestar`. You can change the folder with the `LEARN_DATA_DIR` environment variable.

If the Codex binary is in a non-standard place, set `LEARN_CODEX_PATH` to its path.

## What goes to the model

Each turn runs `codex exec` read-only, in an empty temporary folder, with the lesson so far. Nothing else is sent.

## Development

- `npm test` runs the tests.
- `npm run lint` checks formatting and lint rules.
- `npm run typecheck` runs the TypeScript type check.
- `npm run eval` runs checks against the real Codex. It spends Codex quota.

The blueprint for the app lives in `docs/blueprint/`.

## Status

Milestone 1 supports Codex only. Gemini CLI and Claude Code are planned.

## License

MIT. See `LICENSE`.
