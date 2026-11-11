# ReszVault frontend

A React, TypeScript, and Vite workspace for organizing PDFs, asking source-based questions, and keeping research notes.

## Local development

Start the FastAPI backend on port 3000, then:

```bash
npm ci
npm run dev
```

Vite uses port **5175** and proxies backend endpoints to port **3000**. `VITE_API_BASE_URL` can override the development API address; no frontend environment file is required for the default local workflow.

## Research workflow

- **Vault library:** create vaults, search names and descriptions, pin frequently used vaults, and switch between grid and list views.
- **Sources:** upload PDFs, watch indexing status, preview the original document, remove sources, and choose which sources a question uses.
- **Ask sources:** stream answers grounded in the selected documents, stop an answer, copy it, or save it into the current notebook.
- **Notebook:** write Markdown with automatic browser storage, preview formatting, and adjust paper color, font, and text size.
- **Export:** download a Markdown vault containing notes, source links, and conversation history. The file is compatible with Obsidian; it does not require an Obsidian installation.
- **Settings:** change workspace appearance and inspect local storage counts.

Vault organization, conversations, notes, and appearance preferences persist in the current browser. Uploaded PDFs and indexing data persist in the backend. Browser data does not automatically synchronize between devices. Guest access works without provider credentials; email and optional Google sign-in use the FastAPI authentication endpoints.

## Checks

```bash
npm run build
npm run lint
npm run test:e2e
```

Activate the backend Python virtual environment before running browser tests so their backend startup command can find Uvicorn. Existing services on ports 3000 and 5175 are reused outside CI. The suite runs against actual local services on desktop and mobile viewports, creates isolated guest identities, and removes its own uploaded sources afterward.

The managed cloud image provides Chromium. On a machine without system Chromium, run `npx playwright install chromium` first. Failed browser tests retain traces in `test-results/`.

## Deployment

Use `frontend` as the Vercel project root. The checked-in `vercel.json` forwards API requests to the configured Render service and supports client-side routes. Backend provider credentials belong in backend environment settings, never in frontend bundles.
