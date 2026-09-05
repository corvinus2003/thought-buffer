# Thought Buffer

A personal web app for examining a thought before choosing an action. Each thought starts with an editable subject–verb–object (SVO) rewrite, followed by up to ten rounds of questions and reflection.

## How it works

- Add at least five thoughts to begin.
- Review and edit the SVO rewrite without losing the original thought.
- Choose one of three questions from GPT-5.6 Luna, or write your own question underneath.
- Write your answer. Review the model’s **What changes** and add your own corrections in the separate box below it.
- Both change boxes and the thought’s history inform the next three questions.
- Accept means “I choose to take this specific action”; reject means “I choose not to”. An ordinary yes/no answer does not make that decision.
- Leave a thought pending at any time. After ten reviewed rounds, leave it pending and move on. Further sessions require an explicit choice.
- Saved history, draft answers, and past decisions remain available when you revisit a thought.

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

Tests use temporary storage and mocked OpenAI responses. They cover the ten-round limit, custom questions, decisions, retained history, persistence, cross-origin protection, and API error handling. Live API access is verified when a user connects a key.
