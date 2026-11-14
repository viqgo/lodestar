# lodestar

A desktop app that teaches one reasoning step at a time, using the AI command line tool you already have. It is inspired by LearnHarness, which it does not copy.

## How a lesson works

A lesson has four parts. First it probes what you already know with a few questions. Then it plans a path of steps toward your goal. Then it teaches each step with three kinds of exercise: predict, explain and check. Finally it finishes the lesson and summarises what you learned.

Items you learn are saved to a knowledge list. Later lessons read that list.

## Requirements

- macOS. Other systems are untested.
- Node 26 and npm 11.
- At least one of: Codex CLI, Claude Code, Gemini CLI (experimental: not yet run against a real Gemini account), installed and signed in. `codex --version`, `claude --version` or `gemini --version` should print a version.

## Run it

```
npm ci
npm run dev
```

If the window does not open and the log says `Electron uninstall`, run `node node_modules/electron/install.js` once. npm may skip Electron's own download.

## Your data

Lessons are JSON files under the app's data folder. On macOS this is `~/Library/Application Support/lodestar`. You can change the folder with the `LEARN_DATA_DIR` environment variable.

If a binary is in a non-standard place, set `LEARN_CODEX_PATH`, `LEARN_CLAUDE_PATH` or `LEARN_GEMINI_PATH` to its path.

`settings.json` (voice settings) and `deepgram.key` (the encrypted key) live in the same folder.

`reviews.json` (boxes, due dates and flashcard questions) lives in the same folder.

## What goes to the model

Each turn runs the lesson's tutor in an empty temporary folder, read-only: `codex exec`, `claude -p` or `gemini -p`. The lesson so far and the tutor instructions from the Profile screen are sent. Nothing else is sent.

## Material, files and web search

A lesson can have a material folder, attached files and a web search switch. Under the folder chooser a note depends on the tutor:

- Codex: "Codex cannot change your files, but it is able to read other files on this Mac."
- Claude Code: "Claude Code can only read inside this folder."
- Gemini: "Gemini is experimental: what it can read has not been verified."

Attached files can be PDF, PNG, JPEG, GIF, WebP, TXT or MD, at most 20 MB each, 10 per lesson and 3 per answer. They are copied into the app's data folder. The app never writes into your material folder. Codex needs `pdftotext` installed to read PDFs. A call that uses a folder, files or web search may take up to 300 seconds.

## Subjects

A subject is a course folder. The senior tutor reads the folder and proposes an outline of 2 to 30 units; you edit the outline and accept it. Each unit is one lesson, started with the subject's folder and tutor. A finished unit leaves a note that the senior tutor and later units see. You can chat with the senior tutor, which may propose changes to the outline that you accept or dismiss. Deleting a subject deletes its lessons and keeps the knowledge items. The senior tutor has the same read-only access to the folder as a lesson, so the three notes under "Material, files and web search" apply:

- Codex: "Codex cannot change your files, but it is able to read other files on this Mac."
- Claude Code: "Claude Code can only read inside this folder."
- Gemini: "Gemini is experimental: what it can read has not been verified."

## Voice

"Start call" in a lesson header starts a spoken lesson. Your answers are heard and sent after a pause of 1.2 seconds. A choice is picked by its letter, its position ("the second one") or its words. A reading is read aloud when you say "read it" and passed when you say "continue" or "next". The tutor's feedback and questions are read aloud. "Skip" or the Space key stops the tutor, "Start over" clears what was heard, and "End call" or leaving the lesson ends the call.

Voice needs your own Deepgram API key: make an account at deepgram.com (a new account comes with free credit) and enter the key under Profile, "Voice". It is stored encrypted with the macOS keychain in `deepgram.key` in the data folder. The app shows only "Key saved", and you can remove the key there. "Speech language" (default `en`) and "Voice" (default `aura-2-thalia-en`) are set in the same place and kept in `settings.json`.

During a call the microphone audio (16 kHz, mono) and the text that is read aloud go to Deepgram (`api.deepgram.com`), and only there. Nothing is sent while the tutor speaks, and no audio is written to disk. The lesson itself still goes only to the lesson's CLI.

Cost: listening is about $0.29 per hour of speech and reading aloud is $0.03 per 1,000 characters, billed by Deepgram to your key.

Limits: voice is tested against a stand-in for Deepgram only until the first live run. Formulas are spoken as "a formula on screen". You cannot talk over the tutor.

## Learning modes

Review: every item of the knowledge list has a box from 1 to 5 and a due date. A new item is due at once. A right answer moves it up one box and it comes back after 3, 7, 14 or 30 days (boxes 2 to 5); a wrong one puts it back in box 1 for the next day. "Review" in the sidebar shows how many items are due; the list can be narrowed to one subject or one lesson.

Flashcards: the tutor writes one question per item, once (one call for every 20 items); after that a flashcard review makes no call. "Show answer", then "I knew it" or "I did not".

Practice: up to 10 due items; for each the chosen tutor asks one new question. A choice is graded by the app, a written answer by the tutor. A practice run is not saved, only its effect on the boxes.

Graph: the knowledge items as a map, grouped by lesson and subject, with arrows from each lesson's plan and the box of every item; a list is shown if the map cannot be drawn.

Side questions: the box "Ask a side question" under a lesson; the answer is saved in the lesson as an aside and never changes its progress.

What goes where: flashcard and practice calls send only the item's text (and your tutor instructions) to the chosen CLI, with no file access and no web search; a side question is sent with the lesson, like any lesson call.

## Development

- `npm test` runs the tests.
- `npm run lint` checks formatting and lint rules.
- `npm run typecheck` runs the TypeScript type check.
- `npm run eval` runs checks against a real CLI. It spends that CLI's quota. Choose the CLI with `LEARN_EVAL_CLI=codex|claude|gemini` (default `codex`).

The blueprint for the app lives in `docs/blueprint/`.

## Status

Milestone 2: choose Codex, Claude Code or Gemini per lesson and switch mid-lesson.

## License

MIT. See `LICENSE`.
