# ReszVault

ReszVault is a research workspace for asking questions about PDFs and GitHub repositories. Upload PDFs into a React vault, ask a question, and follow the answer back to its source. Django REST Framework serves authentication, uploads, chat, and GitHub research. PostgreSQL stores accounts, sessions, PDFs, extracted chunks, and repository indexes.

## Run locally

Use Python 3.11+, Node.js 22.12+, and Docker Compose. From the repository root, run:

```bash
cp backend/.env.example backend/.env
docker compose --env-file backend/.env -f backend/compose.yaml up -d --wait
python -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py createsuperuser
python backend/manage.py runserver 127.0.0.1:8000
```

On Windows PowerShell, activate the environment with `.venv\Scripts\Activate.ps1`.

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

| Service | Local address |
| --- | --- |
| React workspace | [http://localhost:5175](http://localhost:5175) |
| Django API health | [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) |
| Django admin | [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/) |
| pgAdmin | [http://127.0.0.1:5050](http://127.0.0.1:5050) |

Sign in to Django admin with the superuser created during setup. In pgAdmin, use `demo@example.com` and `reszvault-demo`. Open the registered **ReszVault** server and use `reszvault-demo` as the default PostgreSQL password. The local PostgreSQL port is `55432`; pgAdmin reaches it at `db:5432` inside Compose.

If the old demo Compose project is still running, free the ports with `docker compose -p django_demo -f backend/compose.yaml down` before starting the new one.

## Walk through PDF Q&A

1. Open the workspace and select **Continue as Guest**.
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

## Tests

Start the local PostgreSQL service and run migrations first. Keep the Python environment active for both commands.

```bash
python backend/manage.py test tests
cd frontend
npx playwright install chromium
npm run test:e2e
```

Playwright starts separate Django and Vite processes. The backend suite covers PDF ownership, upload and deletion, stream messages, authentication, GitHub indexing, and import compatibility.

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
