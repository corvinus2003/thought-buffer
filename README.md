# Thought Buffer

A personal statement translator that turns a vague thought into a concrete external next step, one thought at a time.

## How it works

1. Enter one thought.
2. Choose the one of six faithful reframings you identify with most.
3. Answer one of three narrowing questions about that reframing.
4. Read **What changes**, remaining uncertainty, and the updated statement. Repeat with six new reframings if needed.
5. A concrete handoff becomes **Finished**: a specific next step, where or with whom it happens, and what it resolves or accomplishes. Finishing does not mean you have committed to or performed the action.
6. After ten answered cycles without a handoff, the thought becomes **Pending**. Another session starts only when you choose to resume it.

Keep multiple thoughts with **+ New thought**. The list shows each starting thought, current statement and status. Switching thoughts retains progress and answer drafts. There are no Accept/Reject buttons, custom questions, correction fields, or manual statement editing.

Actor / action or state / target is a practical meaning scaffold. The six reframings shift emphasis without inventing ownership, commitments or motives. Questions narrow toward particulars; they do not ask why. Technical unknowns can become a concrete verification handoff rather than an unsupported answer. Handoffs are displayed, never executed by the app.

### Existing saves

Version 2 retains previous thoughts, drafts, answers, corrections, and decisions as read-only earlier history. Previous Accepted/Rejected entries become Pending, since a past action decision is not a translator handoff. Old cycles do not consume new translator sessions. On the first migrated save, `buffer.before-translator.json` preserves the full earlier save alongside the rotating `buffer.previous.json`. Desktop and web data locations remain separate.

## Standalone Mac app

The Apple silicon edition opens in its own window and bundles its runtime. Download
its `.dmg` from this repository's Releases, drag Thought Buffer into Applications,
and enter an API key through **Connect Luna**. The family build is ad-hoc signed,
not notarized by Apple; see [installation instructions](desktop/INSTALL.txt).

If macOS says “Thought Buffer.app can’t be opened” after you copy it into
Applications, open **Terminal** and run:

```sh
xattr -cr "/Applications/Thought Buffer.app"
```

Then open Thought Buffer again. Only use this for a download you trust from this
repository: the command removes all extended attributes from the app and its
contents, including the quarantine marker used by macOS download checks. It does
not sign or notarize the app.


Desktop saves are independent from the local web app and live under
`~/Library/Application Support/Thought Buffer/data/`. The installer contains no
personal data or key. Updating the application keeps that folder intact. No
background web server is required for the desktop edition.

To build the desktop edition on an Apple silicon Mac after installing dependencies:

```sh
pnpm build:desktop
pnpm package:mac
```

Packaging downloads the pinned Electron release, verifies its checksum, stages only
allowlisted files, signs the app locally, runs a smoke test with temporary data,
and creates a verified disk image in `outputs/releases/`. The GitHub workflow
performs the web build, tests, typecheck, desktop build, and packaging before
publishing a release in this repository. Run it manually for later updates.
The packaged app reuses the same React screen and local API as the web edition.

## Run locally

Use Node.js 22.13 or newer and pnpm. In the project folder:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open http://127.0.0.1:4319/ in your browser. Keep the server running while using the app. For development, use `pnpm dev` instead of the build/start steps.

On macOS, after building, `node scripts/launch.mjs` starts the server in the background and opens the browser. The personal compiled Mac launcher is not included in this repository.

## Connect the model

Open **Connection**, enter your OpenAI API key, and choose **Connect & verify**. The app uses `gpt-5.6-luna` without substituting another model. Verification makes one small test request without using your thoughts. API usage is billed separately from ChatGPT.

Your key is saved to `.local/connection.json` with owner-only file permissions. Alternatively, set `OPENAI_API_KEY` in the server environment. A saved connection takes precedence over the environment variable.

## Local data and privacy

- `.local/buffer.json` stores the thought collection.
- `.local/buffer.previous.json` keeps the previous successful save.
- `.local/connection.json` stores the API key when configured.
- `.local`, environment files, dependencies, generated builds, scratch work, and personal launchers are excluded from Git.
- Each model request sends the active thought and its history to OpenAI. API response storage is disabled with `store: false`; other provider retention policies may still apply.

This version is a single-user app that listens on the local computer. Uploading it to GitHub does not host a working website. Remote sharing requires a separate hosting setup, authentication, and separate user data. GitHub Pages alone cannot run this backend.

## Development

Built with React, Vinext/Vite, and the generated Sites component setup, adapted to Node for local filesystem persistence.

```sh
pnpm typecheck
pnpm test
```

Tests use temporary storage and mocked OpenAI responses. They cover the translator cycle, required reframing selection, ten-answer boundary, handoff validation, migration, retained drafts/history, persistence, cross-origin protection, and API error handling. Live API access is verified when a user connects a key.

Structured responses use the existing Responses API JSON-schema format; see [official OpenAI documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
