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
250 eligible files from a bounded public archive at the default-branch commit.
Private repositories and public archive fallbacks use up to 16 docs and 16
source files. The GitHub App needs
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

### SWE-QA evaluation

The local runner uses the production ranker and reports file Hit@K, Recall@K,
and MRR@K. It infers reference files from explicit paths in the benchmark's
answers. Questions without matching paths are counted separately. File hits
measure whether ranking finds a referenced file, without grading the generated
answer or verifying the cited lines.

Use the pinned source commit from the upstream SWE-QA `repo_commit.txt`.
For a comparison on Flask, use `Benchmark/flask.jsonl` from SWE-QA release
revision `c13deac7a0d99b0ca2e593e004c4739475785b08` and Flask revision
`85c5d93cbd049c4bd0679c36fd1ddcae8c37b642`.

```sh
PYTHONPATH=backend python backend/eval/swe_qa.py \
  --dataset /path/to/Benchmark/flask.jsonl \
  --repo /path/to/flask \
  --revision 85c5d93cbd049c4bd0679c36fd1ddcae8c37b642 \
  --window production --scope archive --top-k 10
```

Use `--window legacy --scope production` for the previous bounded chunking
and `--window paper --scope full` for 500-line windows with 100-line overlap.
The latter uses ReszVault's ranker, while the published baseline uses
Voyage embeddings and FAISS. `--embeddings` enables the local embedding model
for an additional experimental comparison.

On the 48 pinned Flask questions, 42 had explicit matching file labels.
With K fixed at 10, legacy coverage and windows hit 13 of 42 questions
(31.0%, recall 16.5%). The archive coverage and current production windows
hit 37 of 42 (88.1%, recall 67.1%). These runs measure source-file retrieval
without live GitHub search or answer generation.

For end-to-end scoring, set `GROQ_API_KEY` and use
`--candidates /path/to/flask_answers.jsonl` to export generated answers.
The reference answer is never included in the model prompt. Feed the export
and reference JSONL to upstream's `Benchmark construction/score/llm-as-a-judge.py`
using `EVAL_CANDIDATE_PATH` and `EVAL_REFERENCE_PATH` and configure the judge's
model and credentials as described in that script. Compare rubric scores only
with matching dataset, model and judging settings.

- [SWE-QA benchmark and judge](https://github.com/peng-weihan/SWE-QA-Bench)
- [Paper and published results](https://aclanthology.org/2026.findings-acl.402.pdf)

### SWE-QA dense mode

Set `REPOSITORY_RAG_MODE=swe-qa`, `VOYAGE_API_KEY`, and
`SWE_QA_ANSWER_API_KEY` in the backend environment to enable this mode for
public-repository code questions. The defaults are `voyage-code-3` and
`gpt-5.1`. `VOYAGE_MODEL`, `SWE_QA_ANSWER_MODEL`, and
`SWE_QA_ANSWER_URL` can be set explicitly for a particular run.

This mode uses 500-line code windows with 100-line overlap and embeds source
windows as documents and questions as queries. It ranks the top ten windows
by exact inner product, equivalent to flat inner-product search. The
paper's larger FAISS indexes can use approximate search. ReszVault uses a
separate snapshot for this mode and embedding model. The live index still
uses ReszVault's public archive limits. The frontend's citation format,
repository access checks, summary route, and explicit PR/issue lookup remain
part of ReszVault. Private repositories use the existing local path.

To export answers using the SWE-QA-style dense backend, pass
`--window paper --scope full --top-k 10 --voyage --paper-answer`
and `--candidates /path/to/answers.jsonl` to the local runner. Use the
official judge and its reference file for rubric results. The runner uses
ReszVault's source-file selection and a file-and-line prompt formatter.
Results can differ from the paper even with matching providers.

During the credential-free audit, the runner evaluated 96 pinned questions
from Flask and Requests. The archive-based keyword pipeline retrieved at
least one labelled file on 37 of 42 Flask questions and 37 of 38 Requests
questions with identifiable file labels. The 500-line keyword run found
36 of 42 Flask questions and 36 of 38 Requests questions. These are
retrieval checks, not the judge's answer scores.
