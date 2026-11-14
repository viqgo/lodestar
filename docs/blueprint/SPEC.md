# Spec - lodestar, milestone 1: the Codex loop

Problem (D1): a new open-source Electron desktop app in TypeScript that runs a LearnHarness-style learning loop, using the AI CLIs a person already has installed as the model. v1 is done when the user names a topic and goal and the app probes what they know, plans a path, teaches step by step with predict / explain / check, and saves the lesson plus a simple list of what they have shown they understand. Milestone 1 uses Codex CLI only (D4).

## Lesson outline
1. Learner enters a topic and a goal.
2. Probe: questions one at a time to find where understanding stops.
3. Plan: a map of steps (nodes) from what is known to the goal.
4. Teach, per node: predict (ungraded) -> explain with a check (graded) -> repair on a failed check.
5. Finish: summary; learned items for passed nodes go to the knowledge list.

## Behavior

Starting up
- B1. On launch the app runs `codex --version` with a 5-second limit. If the command is missing, exits non-zero, or times out, the app shows "Codex CLI not found. Install it and sign in, then press Retry." and the New lesson button is disabled. Retry re-runs the check.
- B2. A new lesson needs a topic and a goal, each 1 to 500 characters after trimming. Otherwise the form shows "Enter a topic and a goal." and nothing is created.

Probe
- B3. Probe questions appear one at a time, kind `choice` or `text`. Each has an optional reasoning box and a confidence choice (Sure / Unsure / Guessing; default none). Both are stored with the answer.
- B4. Probing ends when the model returns `probe_done`, or after 8 answered probe questions, when the next call carries the note "You have asked 8 questions. You must return probe_done now." and only `probe_done` is allowed. The app then shows "What you already know" (the `known` list) and the sharpened goal.

Plan
- B5. The plan has 2 to 12 nodes. Each has a unique non-empty `id`, a non-empty `title`, and `deps` (ids of other nodes). Every dep must exist; no node may depend on itself; there must be no cycle. An invalid plan is a bad reply (B11).
- B6. The plan is drawn as a map. The current node is highlighted, passed nodes are ticked, shaky nodes are marked.

Teach
- B7. Each node runs `predict`, then `explain` (which carries a check question). A `predict` is allowed only for a node whose deps are all passed or shaky, and which is not itself passed or shaky. An `explain` is allowed only for the current node, after its predict was answered.
- B8. `choice` checks are graded by the app (answer index equals `correctIndex`); the app shuffles the options for display. `text` checks are not graded by the app: the answer is sent to the model, whose next action carries the verdict in `verdict` ("pass" or "fail").
- B9. After a failed check the only allowed action is `explain` for the same node, with a new check. After 3 failed checks on a node, the node is marked shaky and the lesson moves on.
- B10. When every node is passed or shaky, the only allowed action is `lesson_done` (summary + learned items). `lesson_done` earlier is a bad reply. Learned items whose `nodeId` is a passed node are appended to the knowledge list; others are dropped.

When things go wrong
- B11. A bad reply is one that is not JSON, does not match the schema, or is not allowed in the current state. The app retries once, appending "Your last reply was not usable: <reason>. Allowed now: <list of action types>." A second bad reply shows "The model gave an unusable reply. Press Retry." Nothing from either reply is saved.
- B12. If Codex exits non-zero or runs over 180 seconds (then it is killed), the app shows "Codex failed: <last non-empty stderr line, cut to 200 characters>" (for a timeout: "Codex failed: no reply after 180 seconds") with a Retry button. The session file is unchanged by the failed call.
- B13. A Stop button kills the running call and returns to the state before it, showing Retry.
- B14. Only one call runs per lesson. While it runs, inputs are disabled and "Thinking…" is shown. A second request while one runs is refused without starting a process.

Saving
- B15. The session is saved after every event, by writing `<file>.tmp` then renaming it over `<file>`.
- B16. The home screen lists lessons newest first (by last update). Opening one resumes at the pending step: an unanswered question is shown again; if the last event was a learner answer with no model reply, Retry is shown and nothing is sent automatically.
- B17. A lesson can be deleted after a confirmation dialog "Delete this lesson? This cannot be undone." Cancel keeps it.

Knowledge list
- B18. The Knowledge screen lists items newest first, each with the title (topic) of the lesson it came from. Each item can be deleted (no confirmation).
- B19. The newest 200 knowledge items are included in every probe-phase prompt.

Safety
- B20. Codex is spawned without a shell, with cwd set to a new empty temporary directory, with flags `exec --json --output-schema <schema path> --ephemeral --sandbox read-only --skip-git-repo-check -`, prompt on stdin. The temporary directory is removed after success, error and stop.

## Data shapes

Model reply (exactly one per call), root `{"action": <one of>}`:

```json
{"type":"probe","question":{"kind":"choice","prompt":"What does a slope measure?","options":["Steepness","Length","Area"],"correctIndex":0}}
{"type":"probe_done","known":["Slope is rise over run"],"goal":"Explain why the derivative is the limit of average slopes"}
{"type":"plan","nodes":[{"id":"avg-rate","title":"Average rate of change","deps":[]},{"id":"limit","title":"Shrinking the interval","deps":["avg-rate"]}]}
{"type":"predict","nodeId":"avg-rate","verdict":null,"feedback":null,"question":{"kind":"text","prompt":"What happens to the slope as the two points get closer?","options":[],"correctIndex":null}}
{"type":"explain","nodeId":"avg-rate","verdict":null,"feedback":"Good instinct.","markdown":"The slope between two points is $\\frac{\\Delta y}{\\Delta x}$ ...","check":{"kind":"choice","prompt":"...","options":["a","b","c"],"correctIndex":1}}
{"type":"lesson_done","verdict":"pass","feedback":"Correct.","summary":"You can now ...","learned":[{"nodeId":"avg-rate","text":"Average rate of change is the slope between two points"}]}
```

Question rules: `kind: "choice"` needs 2 to 6 options and `correctIndex` inside the options (probe questions may use `null` when there is no right answer); `kind: "text"` needs `options: []` and `correctIndex: null`. `verdict` is non-null only when the previous learner event was a `text` check answer.

Failure: during probing the model returns `{"type":"plan",...}` -> retried once with "Your last reply was not usable: plan is not allowed now. Allowed now: probe, probe_done." -> second bad reply -> B11 message, session file unchanged.

Files (under Electron `userData`):
- `sessions/<id>.json` - one per lesson.
- `knowledge.json` - `[{ "id": "k_...", "text": "...", "sessionId": "s_...", "nodeId": "avg-rate", "createdAt": "2026-11-13T10:15:00.000Z" }]`

## Tests

| Test | Checks | Behavior |
|------|--------|----------|
| detect_reports_missing_cli | missing command gives the B1 message and disabled button | B1 |
| detect_times_out_after_5s | hanging version check counts as missing | B1 |
| new_lesson_rejects_empty_fields | exact B2 message, nothing created | B2 |
| new_lesson_rejects_over_500_chars | 501-character topic rejected | B2 |
| probe_card_collects_reasoning_and_confidence | both stored with the answer | B3 |
| probe_ends_on_probe_done | phase moves to plan, summary shown | B4 |
| probe_forces_conclusion_after_8 | ninth call carries the "must return probe_done" note; only probe_done allowed | B4 |
| plan_rejects_cycle | looping plan is a bad reply | B5 |
| plan_rejects_unknown_dep | missing dependency is a bad reply | B5 |
| plan_rejects_size_out_of_range | 1 node and 13 nodes rejected | B5 |
| plan_map_marks_states | current, passed, shaky nodes render differently | B6 |
| teach_rejects_step_with_unmet_deps | predict for a blocked node is a bad reply | B7 |
| teach_orders_predict_explain_check | explain before predict is a bad reply | B7 |
| choice_check_graded_by_app | right option passes after shuffling | B8 |
| text_check_sent_to_model | free-text answer goes into next call; verdict read from reply | B8 |
| failed_check_requires_same_node | another node after a fail is a bad reply | B9 |
| third_fail_marks_shaky | node becomes shaky, next node allowed | B9 |
| lesson_done_saves_only_passed | shaky nodes' items not saved | B10 |
| lesson_done_rejected_while_steps_remain | finishing early is a bad reply | B10 |
| bad_reply_retries_once_then_errors | one retry with the note, then the exact B11 message | B11 |
| cli_error_shows_last_stderr_line | exact B12 message, cut at 200 characters | B12 |
| cli_timeout_after_180s | process killed, timeout message shown | B12 |
| failed_call_leaves_session_unchanged | saved file identical before and after | B12 |
| stop_kills_process_and_restores | child killed, state as before | B13 |
| second_call_refused_while_running | no second process starts | B14 |
| save_is_atomic | failure mid-write leaves the old file intact | B15 |
| sessions_listed_newest_first | order on the home screen | B16 |
| resume_shows_pending_question | unanswered card reappears | B16 |
| resume_offers_retry_for_interrupted_call | Retry shown, nothing sent automatically | B16 |
| delete_session_needs_confirm | cancelling keeps the lesson | B17 |
| knowledge_listed_newest_first_with_source | order and lesson title | B18 |
| knowledge_item_deleted | item removed from the file | B18 |
| prober_prompt_includes_newest_200 | with 250 items only the newest 200 are sent | B19 |
| codex_spawn_uses_safe_flags | no shell, exact flags, empty temporary cwd | B20 |
| temp_dir_removed_after_call | removed on success, error and stop | B20 |

All tests run against a fake CLI runner; none call real Codex.

## LLM evals (`npm run eval`, real Codex, run by hand)

| # | Input | Expected | Scoring |
|---|-------|----------|---------|
| E1 | topic and goal, no history | `probe` | action type + schema valid |
| E2 | 8 probe answers + the must-conclude note | `probe_done`, `known.length >= 1`, non-empty `goal` | structural |
| E3 | after `probe_done` | `plan` passing B5 | structural |
| E4 | after the plan | `predict` for a node with no unmet deps | structural |
| E5 | predict answered | `explain` for the same node, with a check | structural |
| E6 | wrong choice answer | `explain` for the same node | structural |
| E7 | correct answer on the last node | `lesson_done`, `learned.length >= 1` | structural |

Pass bar: 6 of 7 on the first attempt, 7 of 7 allowing the single B11 retry. Budget: under 60 seconds per call; under 30,000 input tokens per call at the start of a lesson. Teaching quality is not measured.

## Out of scope
- Gemini CLI and Claude Code adapters (milestone 2)
- Practice mode, knowledge graph view, flashcards
- Word-by-word streaming
- Attaching PDFs or images, dictation, web search
- Plugins, editing prompts in the app, themes
- Choosing a model (uses the Codex default)
- Packaging, auto-update, Windows and Linux
- Side questions during a lesson
- Any styling beyond UI.md
