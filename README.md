# ReszVault

ReszVault is a research workspace for asking questions about PDFs and GitHub repositories. Upload PDFs into a React vault, ask a question, and follow the answer back to its source. Django REST Framework serves authentication, uploads, chat, and GitHub research. PostgreSQL stores accounts, sessions, PDFs, extracted chunks, and repository indexes.

## Run locally

With Docker Compose v2.24+, start React, Django, PostgreSQL, and pgAdmin from the repository root.

```bash
docker compose up --build
```

Django applies migrations at startup. The comparison demo works with the default settings.

| Service | Local address |
| --- | --- |
| React workspace | [http://localhost:5175](http://localhost:5175) |
| Django API health | [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) |
| Django admin | [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/) |
| pgAdmin | [http://127.0.0.1:5050](http://127.0.0.1:5050) |

Create a Django admin account after the app starts.

```bash
docker compose exec backend python manage.py createsuperuser
```

In pgAdmin, sign in with `demo@example.com` and `reszvault-demo`. Open the registered **ReszVault** server and use `reszvault-demo` as the default PostgreSQL password. pgAdmin reaches PostgreSQL at `db:5432` inside Compose.

`docker compose down` stops the stack and keeps the database volume, including uploaded PDFs and indexed chunks. Compose retains the prior project name so databases created with the previous `backend/compose.yaml` command can be reused. If you ran that command with a custom project name, use the same `-p` value here. If the earlier `django_demo` project is holding the ports, stop it with `docker compose -p django_demo down` first.

For Groq or OAuth, copy `backend/.env.example` to `backend/.env` and set the provider credentials. If you customize the local PostgreSQL settings, pass `--env-file backend/.env` to Compose when starting either setup. Update the registered pgAdmin server if you change its PostgreSQL username.

### Local development with hot reload

You need Python 3.11+ and Node.js 22.12+. Start only the database tools in Docker, then run Django and Vite on your machine.

```bash
docker compose up -d --wait db pgadmin
python -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py runserver 127.0.0.1:8000
```

On Windows PowerShell, activate the environment with `.venv\Scripts\Activate.ps1`.

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

## Walk through PDF Q&A

1. Select **Continue as Guest**, or sign in and open **PDF Vault** from the GitHub chat sidebar.
2. Upload [return-policy.pdf](frontend/e2e/fixtures/return-policy.pdf) from the sidebar.
3. Ask **What is the return window?** The answer should include **30 days from delivery** and identify the return policy as its source.
4. Open Django admin and inspect the **Books** and **Chunks** records.

| Step | Code |
| --- | --- |
| React sends the upload and question | [PDF requests](frontend/src/api/books.ts) and [chat requests](frontend/src/api/chat.ts) |
| Django validates the PDF and stores the original and chunks together | [PDF views](backend/vaults/pdf_views.py) and [models](backend/vaults/models.py) |
| Django filters documents by owner and selected IDs before retrieval | [Chat view](backend/vaults/pdf_views.py) and [ranking](backend/rag.py) |
| Playwright uploads a PDF through the real guest workspace and verifies the answer and guest isolation | [Browser test](frontend/e2e/pdf-chat.spec.ts) |

Use `GROQ_API_KEY` in `backend/.env` to enable generated answers from retrieved context. The default installation supports local keyword retrieval and extractive answers. For local semantic or hybrid ranking, install `backend/requirements-embeddings.txt` in an environment with enough memory. The first use downloads the embedding model.

## Compare PDF policies

Upload both [return-policy.pdf](frontend/e2e/fixtures/return-policy.pdf) and [short-return-policy.pdf](frontend/e2e/fixtures/short-return-policy.pdf) into the same vault. Ask **Is the return window 15 or 30 days?**. ReszVault quotes both pages and explains that the available evidence does not determine which policy applies.

For multi-document questions, [the LangGraph workflow](backend/pdf_comparison.py) retrieves passages per selected document. When sources give different numeric durations, a second pass checks the relevant documents for explicit scope and effective dates. For example, a policy can state `Scope: online orders` and `Effective date: 2025-06-01`. Ask with the scope or with an ISO as-of date to see whether the available evidence establishes a rule. If metadata is missing or ambiguous, both versions stay visible. The policy comparison works without an API key.

## Tests

Start the local PostgreSQL service and run migrations first. Keep the Python environment active for both commands.

```bash
python backend/manage.py test tests
cd frontend
npx playwright install chromium
npm run test:e2e
```

Playwright starts separate Django and Vite processes by default. To test a running Docker stack from the host, use:

```bash
cd frontend
npm ci
npx playwright install chromium
PLAYWRIGHT_BASE_URL=http://localhost:5175 npm run test:e2e
```

The backend suite covers PDF ownership, upload and deletion, stream messages, policy comparison, authentication, GitHub indexing, and import compatibility.

## MCP search

Install `backend/requirements-mcp.txt` in the backend Python environment. Configure the MCP client's stdio command to use that environment's Python executable and pass the absolute path to `backend/manage.py`, followed by `vault_mcp`. Set `RESZVAULT_MCP_SESSION_TOKEN` in the client's environment using a session issued by the ReszVault sign-in API. Keep that token private. The read-only `search_vault_sources` tool returns titles, page numbers, and matching passages for documents owned by that session. It also accepts an optional list of book IDs.

## Migrate an existing installation

Back up the old SQLite database and its uploads directory before switching traffic. After running the Django migrations against an empty PostgreSQL database, import the backup:

```bash
python backend/manage.py import_legacy_sqlite /path/to/reszvault.sqlite3 --uploads-dir /path/to/uploads
```

The command reads the backup without writing to it. It preserves account and document IDs, password hashes, session records, indexed text, repository indexes, and available PDF files. Re-running it retains existing PostgreSQL records. If an original PDF is missing from the backup, its indexed text remains available. Workspaces and chat history already saved by React stay in that browser.

For a hosted cutover, configure `DATABASE_URL`, `DJANGO_SECRET_KEY`, the frontend origin, and the existing OAuth provider credentials on the Django service. Apply migrations and import any legacy data before switching. The repository's [Render Blueprint](render.yaml) defines the Django server commands. Keep the frontend proxy pointed at the service that runs those commands.

For API routes, GitHub App setup, and repository retrieval details, see the [backend guide](backend/README.md).

## License

This project is currently unlicensed for public reuse.
