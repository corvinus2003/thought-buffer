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
