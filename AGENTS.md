# SVO-Codex / Thought Buffer

This repository contains the SVO-Codex / Thought Buffer app. Preserve the product rules and existing local-only architecture unless the user requests a change.

## Product requirements

- Personal, local-only Mac web app; do not publish or register a hosted site unless the user asks.
- Preserve the original thought and use an editable SVO rewrite.
- Accept means only “I choose to take this specific action”; reject means “I choose not to”. Conversational yes/no answers never make a decision.
- Each round presents three LLM question alternatives and an empty custom-question field underneath. The user answers one question.
- Luna writes “What changes”. An empty user corrections/additions field sits underneath. Both change boxes and history must inform the next three questions.
- Maximum ten answered rounds per session. After reviewing round ten, unresolved thoughts become Pending and the app advances to the next unprocessed thought. Further sessions require an explicit user choice.
- Preserve drafts, history, and exact actions associated with past decisions. No Triggers category.

## Runtime and data

- Model: gpt-5.6-luna, no silent substitution.
- Loopback URL: http://127.0.0.1:4319/
- Local state: .local/buffer.json; previous save: .local/buffer.previous.json.
- API key, when configured: .local/connection.json. Never print, commit, or send the key anywhere except the OpenAI API. Do not inspect users’ thought text merely to check connection health.
- Launcher source: scripts/launch.mjs; Mac launcher: outputs/Thought Buffer.app.
- Preserve .local data during builds and migration.

## Development

Use the existing Sites/Vinext setup, lockfile, and installed components. Local filesystem persistence requires the Node runtime; do not add hosted storage. Build with the project’s build script and run relevant tests and typechecks after logic changes. Tests mock the OpenAI API and must not overwrite personal state.

Use Node.js 22.13 or newer and pnpm. Standard scripts: dev, build, start, test, typecheck. The local API health endpoint includes projectRoot so launchers can distinguish this checkout from stale copies.

## Desktop distribution

- `desktop/` reuses the existing page and API in a sandboxed Electron window.
- Desktop data lives in `~/Library/Application Support/Thought Buffer/data/`, never inside the app bundle. Do not migrate personal data implicitly.
- `pnpm build:desktop` stages an explicit allowlist in `work/desktop-app`; `pnpm package:mac` builds the Apple silicon DMG.
- The family build is ad-hoc signed, not Developer ID signed or notarized. Preserve that disclosure.
- GitHub release builds run `.github/workflows/mac-release.yml`; no API key is needed in CI. Smoke tests must use temporary userData.
