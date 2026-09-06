# SVO-Codex / Thought Buffer

This repository contains the Thought Buffer web app and standalone Mac app. Work in this checkout and preserve local user data.

## Product requirements

- Personal, local-only Mac web app; do not publish or register a hosted site unless the user asks.
- Start with one thought. Keep + New thought and a list showing original thoughts, current statements and status.
- Preserve the original thought. Luna generates a read-only actor / action or state / target parse and six faithful meaning-based reframings per cycle.
- The only thought inputs are the original thought, a choice of one of six reframings, and an answer to one of three narrowing questions. No custom-question field, corrections box, manual rewrite, or Accept/Reject controls.
- Luna generates What changes, remaining uncertainty, and a new faithful statement after each answer. All history informs subsequent reframings and questions. Never invent motives, commitments, or new goals.
- Finished means a concrete external handoff: a next step, where or with whom, and what it resolves or accomplishes. It does not imply action or commitment. Conversational yes/no alone never finishes a thought.
- Maximum ten answered cycles per session. An unresolved tenth cycle becomes Pending; a solved tenth cycle becomes Finished. Resuming Pending requires an explicit new-session choice. Switching thoughts preserves drafts and progress.
- Preserve old drafts, history and exact past decisions as read-only legacy history. Save format v2 retains v1 content and a pre-migration backup. No Triggers category.

## Runtime and data

- Model: gpt-5.6-luna, no silent substitution.
- Loopback URL: http://127.0.0.1:4319/
- Local state: .local/buffer.json; previous save: .local/buffer.previous.json.
- API key, when configured: .local/connection.json. Never print, commit, or send the key anywhere except the OpenAI API. Do not inspect users’ thought text merely to check connection health.
- Launcher source: scripts/launch.mjs; Mac launcher: outputs/Thought Buffer.app.
- Preserve .local data during builds and migration. Old projectless files are a backup, not the active save location.

## Development

Use the existing Sites/Vinext setup, lockfile, and installed components. Local filesystem persistence requires the Node runtime; do not add hosted storage. Build with the project’s build script and run relevant tests and typechecks after logic changes. Tests mock the OpenAI API and must not overwrite personal state.

Use Node.js 22.13 or newer. Standard scripts: dev, build, start, test, typecheck. The local API health endpoint includes projectRoot so launchers can distinguish this checkout from stale copies.

## Desktop distribution

- `desktop/` reuses the existing page and API in a sandboxed Electron window.
- Desktop data lives in `~/Library/Application Support/Thought Buffer/data/`, never inside the app bundle. Do not migrate personal data implicitly.
- `pnpm build:desktop` stages an explicit allowlist in `work/desktop-app`; `pnpm package:mac` builds the Apple silicon DMG.
- The family build is ad-hoc signed, not Developer ID signed or notarized. Preserve that disclosure.
- GitHub release builds run `.github/workflows/mac-release.yml`; no API key is needed in CI. Smoke tests must use temporary userData.
