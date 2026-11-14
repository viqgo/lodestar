# UI - lodestar, milestone 1

Status: approved 2026-11-13 (D23).

Reference look (D10): LearnHarness, taken as layout and mood only: dark near-black window, a lesson list on the left, the lesson as one reading column in the middle, bordered question cards with a "your thinking" box, a lesson map on the right, small uppercase monospace labels, a serif lesson title. No LearnHarness asset, color value, icon or sentence is copied. Where the two differ, the simpler chat layout wins: one scrolling column, no docks or overlays.

The template is `ui-template.html` (open it in a browser). Styling is plain CSS: `src/renderer/src/styles/tokens.css` holds the variables below and nothing else; `app.css` holds the component classes from the template.

## Tokens
| Token | Value | Used for |
|-------|-------|----------|
| color-bg | #0e0e0f | window background |
| color-surface | #17181a | cards, inputs, hovered rows |
| color-surface-2 | #1f2023 | active row, hovered buttons and options |
| color-text | #ececec | body text |
| color-muted | #8b8d93 | secondary text, labels |
| color-border | #2c2d31 | all borders and dividers |
| color-accent | #e8b84a | primary button, selection, current step, shaky step |
| color-accent-text | #14140f | text on accent |
| color-danger | #f0736a | errors, wrong answers, delete |
| color-success | #6fcf8e | passed steps, correct answers |
| font-body | system-ui, -apple-system, "Segoe UI", sans-serif | prose |
| font-title | "Iowan Old Style", "Palatino Linotype", Georgia, serif | lesson and screen titles |
| font-mono | ui-monospace, Menlo, Consolas, monospace | labels, buttons, status text |
| text-xs / sm / base / lg / xl | 12 / 14 / 16 / 20 / 28 px | labels / secondary / body / section / title |
| space-1 ... space-6 | 4 8 12 16 24 40 px | all gaps and padding |
| radius | 6px | buttons, inputs, cards, rows |
| sidebar-width | 240px | left column |
| plan-width | 300px | right column |
| max-width | 720px | reading column |

## Components
| Component (code) | States | Notes |
|------------------|--------|-------|
| Button (`.btn`) | default, hover, disabled; variants primary, danger | one primary per screen |
| Text input / textarea (`.field`) | empty, filled, focus, disabled, error message below | label always visible above, as a mono label |
| Banner (`Banner`) | error, info; with or without an action button | sits at the end of the reading column |
| Thinking bar (`ThinkingBar`) | one | "Thinking…" + Stop |
| Question card (`QuestionCard`) | pending choice, pending text, answered, answered-pass, answered-fail; option: default, hover, selected, correct, wrong | label shows the purpose; confidence buttons on probe only; Submit disabled until an option is picked or text typed |
| Lesson row (`Sidebar`) | default, hover (shows ×), active | topic, then phase and relative time |
| Plan map (`PlanPanel`) | node: todo, current, passed, shaky | Mermaid graph; plain list fallback |
| Reading (`ChatItemView`) | pending (with Continue), continued | CR-3: the tutor's full text as plain prose in the column, no box; Continue is the one primary button; once continued the button is gone |
| Profile screen (`ProfileScreen`) | empty, edited, saved, error | CR-4: one textarea (`.field`) with a visible label, one Save button (primary, disabled until edited) |
| Tutor picker (`TutorPicker`) | option: default, hover, selected, disabled ("not installed") | milestone 2: radio rows in the `.option` style under the label "Tutor"; used on New lesson and after "Change tutor" |
| Probe summary (`ChatItemView`) | one | known list + goal |
| Lesson summary (`ChatItemView`) | one | summary + counts line |
| Confirm dialog (`ConfirmDialog`) | one | centered over a dimmed window |

## Screens
All screens share the sidebar. Minimum window 960x600; there are no narrow-screen layouts.

### New lesson
```
+-----------+------------------------------------------+
| [New lesson] |  What do you want to learn?           |
| LESSONS   |  TOPIC [                    ]            |
| ...       |  GOAL  [                    ]            |
|           |  ( Start )                               |
| [Knowledge]|                                         |
+-----------+------------------------------------------+
```
- Empty list: "No lessons yet."
- Error: "Enter a topic and a goal." under the goal field
- Codex missing: error banner above the title; form and New lesson disabled

### Lesson
```
+-----------+---------------------------+-------------+
| sidebar   |  <Topic>                  | LESSON MAP  |
|           |  Goal: <goal>             |  [node]     |
|           |  ...items, oldest first   |    |        |
|           |  [question card]          |  [node]     |
|           |  Thinking… [Stop]         |             |
+-----------+---------------------------+-------------+
```
- The right column appears only once a plan exists.
- Loading: the thinking bar. Inputs in the pending card are disabled while it shows.
- Error: banner at the end of the column with Retry (messages from SPEC).
- Finished: lesson summary; no card, no thinking bar.

### Knowledge
- List of items, newest first: text, then "<lesson topic> · <relative time>", and a × button.
- Empty: "Nothing here yet. Finish a lesson and what you learned will appear here."

## Copy
| Where | Text |
|-------|------|
| Sidebar | "New lesson", "Lessons", "Knowledge", "No lessons yet." |
| Lesson row status | "probing", "planning", "teaching", "done", then " · " and relative time ("just now", "5m ago", "2h ago", "3d ago") |
| New lesson | title "What do you want to learn?"; labels "Topic", "Goal"; placeholders "e.g. Derivatives", "e.g. Understand why the derivative is the slope of the tangent line"; button "Start" |
| Validation | "Enter a topic and a goal." |
| No CLI (milestone 2, replaces "Codex missing") | "No AI CLI found. Install Codex, Claude Code or Gemini CLI and sign in, then press Retry."; button "Retry" |
| Tutor (milestone 2) | picker label "Tutor"; rows "Codex", "Claude Code", "Gemini (experimental)"; a missing one adds " · not installed"; lesson header "Tutor: <name>" and button "Change tutor"; missing in a lesson: "<name> not found. Install it and sign in, then press Retry."; dialog "Switch this lesson to <name>? It will read the whole lesson so far and continue from there." with "Cancel", "Switch"; refusals "Choose a tutor.", "A reply is already on the way." |
| Lesson header | "Goal: <goal>" |
| Card labels | "Probe", "Predict", "Check" |
| Card fields | "Your answer" (placeholder for predict: "Take a guess. This is not graded."; for probe and check: "Type your answer"); "Your thinking (optional)" (placeholder "Why do you think so?") |
| Confidence | "Sure", "Unsure", "Guessing" |
| Card button | "Submit"; on a reading: "Continue" |
| Grades | "Correct", "Not yet" |
| Probe summary | "What you already know", "Your goal" |
| Plan notice | "Your path: <n> steps" |
| Plan panel | "Lesson map" |
| Thinking | "Thinking…", "Stop" |
| Stopped | "Stopped." + "Retry" |
| Codex banner | shown above every screen (not only the new lesson screen) while Codex is missing, so Retry is always reachable (D34) |
| Interrupted lesson | "The last reply did not arrive." with button "Retry" (info banner; added by D31) |
| Errors | "The model gave an unusable reply. Press Retry."; "Codex failed: <detail>"; "This lesson no longer exists."; "Could not save. Check free disk space."; button "Retry" |
| Lesson summary | the summary text is shown as normal prose above a block that holds the label "Lesson complete" and (D31);  "<n> items added to your knowledge list." and, when any step is shaky, " <m> step is still shaky." / " <m> steps are still shaky." |
| Delete lesson | "Delete this lesson? This cannot be undone."; "Cancel", "Delete" |
| Profile | sidebar button "Profile"; title "Profile"; "Tell your tutor how you want to be taught. It is added to every lesson from the next reply on."; label "Tutor instructions"; placeholder "e.g. Explain like I'm a nurse. Use more worked examples. Keep readings short."; button "Save"; "Saved."; error "Could not save. Check free disk space." |
| Knowledge | title "Knowledge"; "What you have shown you understand. Later lessons start from here."; "Deleted lesson" when the source is gone; empty text above |

## Tutor picker (milestone 2)
- New lesson: the picker sits between Goal and Start.
- Lesson: under the goal line, one row (`.row`): the note "Tutor: <name>" and the button "Change tutor" (hidden when the lesson is done, disabled while a reply is on the way). Pressing it shows the picker under the row; choosing a different installed CLI opens the confirm dialog; choosing the current one or pressing "Change tutor" again closes the picker.
- New CSS, existing tokens only: `.option.is-disabled { color: var(--color-muted); cursor: default; }`, `.option.is-disabled:hover { background: transparent; }`, `.row { display: flex; align-items: center; gap: var(--space-3); }`.

## Telling text from questions (CR-3)
- Tutor text (readings, bridges, feedback, summaries) is plain prose in the reading column: no border, no background, `color-text`.
- Questions are the only boxed things: `.card` with a 3px `color-accent` left border, and the answer inputs inside a card use `color-bg` as their background with a `color-muted` border, so they read as fill-in fields against the `color-surface` card.
- No new colors, sizes or components beyond the tokens above.

## Behavior
- Keyboard: Cmd+Enter submits the pending card. Enter in the Topic field moves focus to Goal. Escape cancels the confirm dialog. Tab order follows the visual order.
- After each new item the reading column scrolls to the bottom.
- Options in a choice card are shown in a shuffled order that stays the same every time that card is drawn.
- Accessibility: every input has a label; icon buttons have `aria-label` ("Delete lesson", "Delete item"); grades and node states use text or a symbol as well as color (✓ passed, ~ shaky); focus is always visible (accent outline).
