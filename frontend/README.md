# ReszVault Frontend

React + Vite frontend for ReszVault, a document research workspace with upload, chat, citations, auth, and project history UI.

## Local Setup

```bash
cp .env.example .env
npm install
npm run dev
```

The local frontend runs on:

```text
http://localhost:5173
```

## Deployment

Recommended Vercel project name:

```text
reszvault
```

Recommended production URL:

```text
https://reszvault.vercel.app
```

The Vercel rewrites in `vercel.json` forward API calls to:

```text
https://reszvault.onrender.com
```

## Environment

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend URL for local/dev usage |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key for auth |

## Scripts

- `npm run dev` - Vite dev server
- `npm run build` - Production build
- `npm run preview` - Preview production build
