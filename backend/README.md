# ReszVault Backend

TypeScript/Bun API for ReszVault.

It supports:

- Better Auth session handling
- Google and X social auth when provider credentials are configured
- PDF upload and indexing
- Prisma/Postgres persistence
- Source-grounded chat over the active vault
- Server-sent event streaming for the frontend chat UI

## Setup

```bash
cd backend
bun install
bunx prisma generate
```

Create a local `.env` from `.env.example` and set the required values,
especially `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `FRONTEND_ORIGIN`.

## Run

The frontend Vite proxy expects the backend on port `3000`.

```bash
cd backend
bun index.ts
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
| `*` | `/api/auth/*` | Better Auth routes |

## Deployment

The root `render.yaml` points Render at this Bun service.

Set production environment variables in Render instead of committing secrets.
