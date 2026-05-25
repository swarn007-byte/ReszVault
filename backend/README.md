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
