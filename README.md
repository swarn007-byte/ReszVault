# ReszVault

ReszVault is a source-grounded research workspace for multi-document chat.

Upload PDFs into a project vault, index them, and ask questions across the full project context instead of being stuck to a single file. The product combines a polished React frontend, a Python/FastAPI backend, retrieval-driven responses, project-based source organization, Google authentication, and Obsidian-style vault export.

Live:

- Frontend: [https://reszvault.vercel.app](https://reszvault.vercel.app)
- Backend: [https://reszvault.onrender.com](https://reszvault.onrender.com)

## Why ReszVault

Most PDF chat tools break once research gets messy:

- Context is trapped inside one uploaded file
- Sources are hard to organize across multiple documents
- Answers feel disconnected from the actual material
- Research workflows have no visual memory or exportable structure

ReszVault solves that by treating a project like a vault:

- Multiple PDFs belong to one project
- Retrieval runs across the whole project scope
- Chat stays source-grounded
- Indexed material can be exported into an Obsidian-friendly structure

## Core Features

- Multi-PDF project vaults
- Source-grounded chat over indexed documents
- PDF upload, parsing, chunking, and retrieval
- Streaming chat responses
- Google-based authentication
- Guest mode for lightweight exploration
- Project-scoped source management
- Obsidian-style vault export with graph-ready note structure
- Clean notebook-inspired UI for research workflows

## Product Flow

1. Sign in with Google or continue as guest
2. Create a new vault or open an existing project
3. Upload one or more PDFs
4. Let ReszVault index and store document chunks
5. Ask questions against the full project context
6. Export the vault for graph-style exploration

## Tech Stack

Frontend:

- React
- TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- Zustand

Backend:

- Python
- FastAPI
- Uvicorn
- SQLite
- `pypdf`

Deployment:

- Vercel for frontend
- Render for backend

## Repository Structure

```text
ReszVault/
├── frontend/     # React + Vite application
├── backend/      # Python FastAPI API
├── django_demo/  # Local Django REST and PostgreSQL demo
└── render.yaml   # Render deployment config
```

## Local Django Demo

This demo runs a PDF question through React, Django REST Framework, and PostgreSQL. The two included PDF fixtures are parsed with `backend/document_parser.py`. Django stores the results as `Vault → Source → Chunk` and filters passages by vault before ranking them. By default the answer shows the matched excerpts and page numbers. Set `RESZVAULT_DEMO_USE_GROQ=1` and `GROQ_API_KEY` in the Django server's environment to generate a response using the retrieved passages.

The demo is for local use with sample data. The deployed app runs on the FastAPI stack documented below.

### Start the demo

You need Python 3.11+, Node.js 22.12+ or 24+, and Docker Compose. From the repo root, run:

```bash
docker compose -f django_demo/compose.yaml up -d --wait
python -m venv .venv
source .venv/bin/activate
python -m pip install -r django_demo/requirements.txt
python django_demo/manage.py migrate
python django_demo/manage.py seed_demo
python django_demo/manage.py createsuperuser
python django_demo/manage.py runserver 127.0.0.1:8001
```

On Windows PowerShell, activate the environment with `.venv\Scripts\Activate.ps1`.

In a second terminal:

```bash
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

Open [the demo on port 5175](http://127.0.0.1:5175/django-demo). Select **Returns** and ask **What is the return window?**. The answer should include **30 days from delivery** and cite page 1 of the return policy. Select **Shipping** and ask the same question to see the no-match response.

- **Django admin** is at [port 8001](http://127.0.0.1:8001/admin/). Sign in with the superuser you created to inspect vaults, sources, and chunks.
- **pgAdmin** is at [port 5050](http://127.0.0.1:5050). Sign in with `demo@example.com` / `reszvault-demo`. Open the registered **ReszVault Demo** server and enter the PostgreSQL password `reszvault-demo`. Look under **Databases → reszvault → Schemas → public → Tables** for `vaults_source` and `vaults_chunk`. To register the server manually with the defaults, use host `db`, port `5432`, maintenance database `postgres`, and username `reszvault`.
- **REST API** exposes `GET /api/demo/vaults/` and `POST /api/demo/vaults/<slug>/ask/` with a JSON body containing `question`.

### Run browser tests

Keep PostgreSQL running and run migrations and `seed_demo` first. In a terminal with the Python environment activated:

```bash
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e
```

Playwright starts its own Django and Vite processes. The browser test checks the Returns answer and its page citation, the same question's no-match response in Shipping, and a successful Shipping answer. To run the Django tests from the repo root, use `python django_demo/manage.py test vaults`.

### Try the read-only MCP tool

With the database running and the demo Python environment active, install the optional requirements:

```bash
python -m pip install -r django_demo/requirements-mcp.txt
```

Configure your MCP client for stdio. Use the absolute path to the demo environment's Python executable as the command, with the absolute path to `django_demo/manage.py` and `vault_mcp` as arguments. The `search_vault_sources` tool takes `vault_slug` and `question` and returns matching passages with page numbers.

## Local Development

### 1. Start the backend

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3000 --reload
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5175` and talks to the backend on `http://localhost:3000`.

## Environment Setup

Create `backend/.env` using `backend/.env.example`.

Typical values:

```env
FRONTEND_ORIGIN=http://localhost:5175
BACKEND_PUBLIC_URL=http://localhost:3000
GROQ_API_KEY=your_key_here
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

For Google OAuth, register these redirect URIs in Google Cloud Console:

```text
http://localhost:3000/api/auth/google/callback
https://reszvault.vercel.app/api/auth/google/callback
```

## API Highlights

- `GET /health` - backend health check
- `GET /books` - list indexed project sources
- `POST /books/upload` - upload and index a PDF
- `DELETE /books/:id` - remove an indexed source
- `POST /chat` - ask a question against the current vault
- `POST /chat/stream` - streaming chat responses
- `GET /api/auth/google/start` - start Google sign-in

## Architecture Notes

ReszVault uses a fairly direct RAG flow:

1. PDFs are uploaded and parsed into text chunks
2. Chunks are stored with project ownership in SQLite
3. Chat requests gather all ready documents within the active project
4. Relevant context is assembled and sent to the answering layer
5. Responses stream back into the chat interface

This keeps the product simple to run locally while still supporting real multi-document workflows.

## What Makes It Interesting

- It is not just a PDF viewer with chat bolted on
- Retrieval is scoped to project-level context
- The UI is designed like a research workspace, not a generic form app
- The vault model makes it easy to extend toward graph memory, note linking, and richer knowledge navigation

## Future Improvements

- Better retrieval ranking and citation display
- Richer Obsidian graph sync and backlink generation
- Source filters inside chat
- Team workspaces and shared vaults
- Background indexing jobs for larger document sets

## Screens / Use Cases

ReszVault fits well for:

- Research assistants
- Students building study vaults
- Resume and interview document review
- Policy or legal document comparison
- Technical reading across multiple PDFs

## License

This project is currently unlicensed for public reuse. Add a license before open-source distribution if needed.
