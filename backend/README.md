# ReszVault Backend

Python/FastAPI API for ReszVault.

It supports:

- Cookie-based local sessions
- Google OAuth when provider credentials are configured
- PDF upload and indexing
- SQLite persistence for local vaults
- Source-grounded chat over the active vault
- Server-sent event streaming for the frontend chat UI

## Setup

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

Create a local `.env` from `.env.example` and set the required values,
especially `FRONTEND_ORIGIN` and `GROQ_API_KEY` if you want LLM answers.

For local Google sign-in, add this redirect URI in Google Console:

```text
http://localhost:3000/api/auth/google/callback
```

## Run

The frontend Vite proxy expects the backend on port `3000`.

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 3000 --reload
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/books` | List indexed PDFs |
| `POST` | `/books/upload` | Upload and index a PDF |
| `DELETE` | `/books/:id` | Delete an indexed PDF |
| `POST` | `/chat` | Non-streaming chat |
| `POST` | `/chat/stream` | Streaming chat for the frontend |
| `GET/POST` | `/api/auth/*` | Python auth/session routes |

## Deployment

The root `render.yaml` points Render at this FastAPI service.

Set production environment variables in Render instead of committing secrets.

## GitHub sign-in and repository chat

Create a GitHub App with **read-only** repository permissions for Metadata,
Pull requests, and Issues. Enable **Request user authorization (OAuth) during
installation** only if you want GitHub to request authorization while users
install the app. Leave webhooks disabled. Allow installation on any account if
the app should support repositories outside the app owner's account.

Set the GitHub App callback URL to
`https://reszvault.vercel.app/api/auth/github/callback` for production, or
`http://localhost:5173/api/auth/github/callback` for local development. Copy the
app's OAuth client ID, client secret, and URL slug into `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, and `GITHUB_APP_SLUG` in the backend environment. Set
`GITHUB_CALLBACK_ORIGIN` to the matching frontend origin. Configure the secret
in Render for production.

GitHub applies the intersection of the user's repository access and the app's
permissions. For private repositories, users can install the app on selected
repositories and then choose one when starting a chat. Public repository
records can be summarized with the configured Groq model. Private repository
chats show matching GitHub records and links without sending their content to
Groq.

## Repository RAG

Opening a repository chat starts an index build in the background. The index
includes up to 300 recently updated issues and pull requests, recent issue and
review comments, reviews and available patches from up to eight PRs, and up to
16 docs and 16 source files from the default branch. The GitHub App needs
**Contents** read access for private source files. When GitHub Discussions is
enabled and accessible to the app, discussion threads and comments are indexed
as well. Questions naming a PR or issue also fetch that item directly, and
topic questions can retrieve older issues and PRs through GitHub search.

Every lookup checks GitHub access and is scoped to the selected repository.
Public repository answers use `GROQ_API_KEY` when configured. Private repository
content stays on the backend and is returned as cited excerpts. Keyword
retrieval runs by default. Set `REPOSITORY_LOCAL_EMBEDDINGS=true` on a service
with enough memory for the local sentence-transformer to add semantic search.

Use **Sync repository** to refresh immediately. Indexes also refresh on use
after six hours. For faster invalidation, configure a GitHub App webhook at
`https://reszvault.vercel.app/api/github/webhook` using the same secret as
`GITHUB_WEBHOOK_SECRET` on the backend. Subscribe to Push, Issues, Issue
comment, Pull request, Pull request review, Pull request review comment, and,
if enabled, Discussion and Discussion comment. Signed events mark an index
stale, and the next access rebuilds it using the user's GitHub authorization.

SQLite keeps the index between requests. The current free Render filesystem
can be reset by restarts or deploys. Mount a persistent disk and set
`RESZVAULT_DATA_DIR` to its mount path for indexes that survive redeploys.
Set this variable in the service environment before process startup.
