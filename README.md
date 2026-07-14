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
└── render.yaml   # Render deployment config
```

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
