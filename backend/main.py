from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated
from urllib.parse import urlencode, urlparse
import json
import urllib.request

from fastapi import BackgroundTasks, Cookie, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel

from document_parser import split_pdf_text
from rag import BookContext, answer_question
from storage import UPLOAD_DIR, db, init_db, row_to_dict, utc_now


SESSION_COOKIE = "reszvault_session"
SESSION_DAYS = 30


def load_local_env() -> None:
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_local_env()

app = FastAPI(title="ReszVault Python API")
init_db()

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:4173",
    "https://reszvault.vercel.app",
]
if os.getenv("FRONTEND_ORIGIN"):
    allowed_origins.append(os.getenv("FRONTEND_ORIGIN", ""))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str
    bookId: str | None = None
    bookIds: list[str] | None = None


class EmailAuthRequest(BaseModel):
    email: str
    password: str
    name: str | None = None
    rememberMe: bool | None = None



def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 180_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _algo, salt, digest = stored.split("$", 2)
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, salt).split("$", 2)[2], digest)


def serialize_user(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "image": row.get("image"),
    }


def create_session(response: Response, user_id: str) -> dict:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)

    with db() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (token, user_id, expires.isoformat(), utc_now()),
        )

    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        path="/",
    )
    return {"userId": user_id, "expiresAt": expires.isoformat()}


def get_user_from_session(token: str | None) -> dict | None:
    if not token:
        return None
    with db() as conn:
        row = conn.execute(
            """
            SELECT users.* FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ? AND sessions.expires_at > ?
            """,
            (token, utc_now()),
        ).fetchone()
    return row_to_dict(row)


def owner_key(session_token: str | None, guest_id: str | None) -> str | None:
    user = get_user_from_session(session_token)
    if user:
        return f"user:{user['id']}"
    if guest_id and re.match(r"^[a-zA-Z0-9_-]{8,100}$", guest_id):
        return f"guest:{guest_id}"
    return None


def title_from_filename(filename: str) -> str:
    clean = re.sub(r"\.pdf$", "", filename, flags=re.I).strip()
    return clean or "Untitled source"


def serialize_book(row: dict) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "filename": row["filename"],
        "status": row["status"],
        "chunkCount": row["chunk_count"],
        "error": row["error"],
        "createdAt": row["created_at"],
    }


def requested_book_ids(book_id: str | None, book_ids: list[str] | None) -> list[str]:
    return [book_id] if book_id else list(dict.fromkeys(book_ids or []))


def load_book_rows(
    owner: str | None,
    ids: list[str] | None = None,
    statuses: tuple[str, ...] | None = None,
) -> list[dict]:
    if not owner:
        return []

    clauses = ["owner_key = ?"]
    params: list[str] = [owner]

    if statuses:
        clauses.append(f"status IN ({','.join('?' for _ in statuses)})")
        params.extend(statuses)
    if ids:
        clauses.append(f"id IN ({','.join('?' for _ in ids)})")
        params.extend(ids)

    query = f"SELECT * FROM books WHERE {' AND '.join(clauses)} ORDER BY created_at DESC"
    with db() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return [row_to_dict(row) or {} for row in rows]


def load_books_for_chat(
    owner: str | None,
    book_id: str | None,
    book_ids: list[str] | None,
) -> list[BookContext]:
    if not owner:
        return []

    ids = requested_book_ids(book_id, book_ids)
    rows = load_book_rows(owner, ids=ids or None, statuses=("ready",))

    books: list[BookContext] = []

    with db() as conn:
        for row in rows:
            chunks = conn.execute(
                "SELECT content FROM chunks WHERE book_id = ? ORDER BY chunk_index",
                (row["id"],),
            ).fetchall()

            books.append(
                BookContext(
                    id=row["id"],
                    title=row["title"],
                    chunks=[chunk["content"] for chunk in chunks],
                )
            )

    return books


def chat_block_reason(owner: str | None, book_id: str | None, book_ids: list[str] | None) -> str | None:
    if not owner:
        return "Open a guest vault or sign in before asking questions."

    rows = load_book_rows(owner, ids=requested_book_ids(book_id, book_ids) or None)
    if not rows:
        return None

    processing_count = sum(1 for row in rows if row.get("status") == "processing")
    if processing_count:
        plural = "" if processing_count == 1 else "s"
        return f"Your vault is still indexing {processing_count} PDF{plural}. Wait for indexing to finish before asking a question."

    failed = [row for row in rows if row.get("status") == "failed"]
    if failed and not any(row.get("status") == "ready" for row in rows):
        return failed[0].get("error") or "The selected PDFs failed during indexing. Re-upload them and try again."

    return None


def process_uploaded_book(book_id: str, pdf_bytes: bytes) -> None:
    try:
        time.sleep(1.2)
        chunks = split_pdf_text(pdf_bytes)
        if not chunks:
            raise ValueError("No readable text found in PDF.")

        with db() as conn:
            conn.execute("DELETE FROM chunks WHERE book_id = ?", (book_id,))
            for index, chunk in enumerate(chunks):
                conn.execute(
                    "INSERT INTO chunks (id, book_id, content, chunk_index, created_at) VALUES (?, ?, ?, ?, ?)",
                    (f"chunk_{uuid.uuid4().hex}", book_id, chunk, index, utc_now()),
                )
            conn.execute(
                "UPDATE books SET status = ?, chunk_count = ?, error = ? WHERE id = ?",
                ("ready", len(chunks), None, book_id),
            )
    except Exception as exc:
        with db() as conn:
            conn.execute(
                "UPDATE books SET status = ?, chunk_count = ?, error = ? WHERE id = ?",
                ("failed", 0, str(exc), book_id),
            )


def request_base_url(request: Request) -> str:
    forwarded_proto = request.headers.get("x-forwarded-proto")
    forwarded_host = request.headers.get("x-forwarded-host")
    if forwarded_host and not forwarded_host.endswith(".onrender.com"):
        return f"{forwarded_proto or request.url.scheme}://{forwarded_host}".rstrip("/")

    configured = os.getenv("BACKEND_PUBLIC_URL")
    if configured:
        return configured.rstrip("/")

    if request.url.hostname in {"127.0.0.1", "localhost"}:
        return "http://localhost:3000"

    if forwarded_host:
        return f"{forwarded_proto or request.url.scheme}://{forwarded_host}".rstrip("/")

    return f"{request.url.scheme}://{request.headers.get('host', request.url.netloc)}".rstrip("/")


def frontend_base_url(request: Request) -> str:
    configured = os.getenv("FRONTEND_ORIGIN")
    if configured:
        return configured.rstrip("/")
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")
    return request_base_url(request)


def safe_callback_path(callback_url: str) -> str:
    parsed = urlparse(callback_url)
    if parsed.scheme or parsed.netloc:
        return parsed.path or "/projects"
    return callback_url if callback_url.startswith("/") else "/projects"


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "runtime": "python"}


@app.get("/auth/providers")
def providers() -> dict:
    return {"google": bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))}


@app.get("/api/auth/session")
@app.get("/api/auth/get-session")
def get_session(reszvault_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None) -> dict:
    user = get_user_from_session(reszvault_session)
    if not user:
        return {"user": None, "session": None}
    return {
        "user": serialize_user(user),
        "session": {"userId": user["id"]},
    }


@app.post("/api/auth/sign-up/email")
def sign_up_email(payload: EmailAuthRequest, response: Response) -> dict:
    email = payload.email.strip().lower()
    if len(payload.password) < 8:
        return {"error": {"message": "Password must be at least 8 characters."}}
    with db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            return {"error": {"message": "An account already exists for this email."}}
        user_id = f"user_{uuid.uuid4().hex}"
        conn.execute(
            "INSERT INTO users (id, name, email, image, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                user_id,
                (payload.name or email.split("@")[0]).strip(),
                email,
                None,
                hash_password(payload.password),
                utc_now(),
            ),
        )
    session = create_session(response, user_id)
    return {"data": {"user": {"id": user_id, "name": payload.name or email.split("@")[0], "email": email, "image": None}, "session": session}, "error": None}


@app.post("/api/auth/sign-in/email")
def sign_in_email(payload: EmailAuthRequest, response: Response) -> dict:
    email = payload.email.strip().lower()
    with db() as conn:
        user = row_to_dict(conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone())
    if not user or not verify_password(payload.password, user.get("password_hash")):
        return {"error": {"message": "Invalid email or password."}}
    session = create_session(response, user["id"])
    return {"data": {"user": serialize_user(user), "session": session}, "error": None}


@app.post("/api/auth/sign-out")
@app.get("/api/auth/sign-out")
def sign_out(response: Response, reszvault_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None) -> dict:
    if reszvault_session:
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (reszvault_session,))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"success": True}


@app.get("/api/auth/google/start")
def google_start(request: Request, callbackURL: str = "/projects") -> RedirectResponse:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        return RedirectResponse(f"/login?error=Google%20login%20is%20not%20configured")
    base_url = request_base_url(request)
    redirect_uri = f"{base_url}/api/auth/google/callback"
    params = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "online",
            "state": safe_callback_path(callbackURL),
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@app.get("/api/auth/google/callback")
def google_callback(request: Request, code: str, state: str = "/projects") -> RedirectResponse:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    base_url = request_base_url(request)
    redirect_uri = f"{base_url}/api/auth/google/callback"
    frontend = frontend_base_url(request)
    if not client_id or not client_secret:
        return RedirectResponse(f"{frontend}/login?error=Google%20login%20is%20not%20configured")

    token_payload = urlencode(
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
    ).encode()
    try:
        token_req = urllib.request.Request("https://oauth2.googleapis.com/token", data=token_payload, method="POST")
        with urllib.request.urlopen(token_req, timeout=20) as token_res:
            token_data = json.loads(token_res.read().decode())
        user_req = urllib.request.Request(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        with urllib.request.urlopen(user_req, timeout=20) as user_res:
            profile = json.loads(user_res.read().decode())
    except Exception:
        return RedirectResponse(f"{frontend}/login?error=Google%20authentication%20failed")

    email = profile.get("email", "").lower()
    if not email:
        return RedirectResponse(f"{frontend}/login?error=Google%20email%20missing")

    response = RedirectResponse(f"{frontend}{safe_callback_path(state)}")
    with db() as conn:
        user = row_to_dict(conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone())
        if not user:
            user_id = f"user_{uuid.uuid4().hex}"
            conn.execute(
                "INSERT INTO users (id, name, email, image, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, profile.get("name") or email.split("@")[0], email, profile.get("picture"), None, utc_now()),
            )
        else:
            user_id = user["id"]
            conn.execute("UPDATE users SET name = ?, image = ? WHERE id = ?", (profile.get("name") or user["name"], profile.get("picture") or user.get("image"), user_id))
    create_session(response, user_id)
    return response


@app.get("/books")
def list_books(
    x_guest_id: Annotated[str | None, Header(alias="x-guest-id")] = None,
    reszvault_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict:
    owner = owner_key(reszvault_session, x_guest_id)
    if not owner:
        return {"books": []}
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM books WHERE owner_key = ? ORDER BY created_at DESC",
            (owner,),
        ).fetchall()
    return {"books": [serialize_book(row_to_dict(row) or {}) for row in rows]}


@app.post("/books/upload")
async def upload_book(
    background_tasks: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
    x_guest_id: Annotated[str | None, Header(alias="x-guest-id")] = None,
    reszvault_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> JSONResponse:
    owner = owner_key(reszvault_session, x_guest_id)
    if not owner:
        raise HTTPException(status_code=400, detail="A vault session is required for upload.")
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    raw = await file.read()

    book_id = f"book_{uuid.uuid4().hex}"
    safe_name = f"{book_id}.pdf"
    path = UPLOAD_DIR / safe_name
    with path.open("wb") as handle:
        handle.write(raw)

    book_title = (title or "").strip() or title_from_filename(file.filename)
    created = utc_now()
    with db() as conn:
        conn.execute(
            "INSERT INTO books (id, owner_key, title, filename, status, chunk_count, error, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (book_id, owner, book_title, file.filename, "processing", 0, None, str(path), created),
        )

    background_tasks.add_task(process_uploaded_book, book_id, raw)

    return JSONResponse(
        status_code=202,
        content={
            "success": True,
            "book": {
                "id": book_id,
                "title": book_title,
                "filename": file.filename,
                "status": "processing",
                "chunkCount": 0,
                "error": None,
                "createdAt": created,
            },
            "message": f'Started indexing "{book_title}" for this vault.',
        },
    )


@app.delete("/books/{book_id}")
def delete_book(
    book_id: str,
    x_guest_id: Annotated[str | None, Header(alias="x-guest-id")] = None,
    reszvault_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict:
    owner = owner_key(reszvault_session, x_guest_id)
    if not owner:
        raise HTTPException(status_code=401, detail="Sign in required")
    with db() as conn:
        row = row_to_dict(conn.execute("SELECT * FROM books WHERE id = ? AND owner_key = ?", (book_id, owner)).fetchone())
        if not row:
            raise HTTPException(status_code=404, detail="Book not found")
        conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
    if row.get("file_path"):
        Path(row["file_path"]).unlink(missing_ok=True)
    return {"success": True}


@app.post("/ingest")
def ingest() -> dict:
    return {"success": False, "message": "Use /books/upload for project PDFs in the Python backend."}


@app.post("/chat")
def chat(
    payload: ChatRequest,
    x_guest_id: Annotated[str | None, Header(alias="x-guest-id")] = None,
    reszvault_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict:
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question is required")
    owner = owner_key(reszvault_session, x_guest_id)
    block_reason = chat_block_reason(owner, payload.bookId, payload.bookIds)
    if block_reason:
        raise HTTPException(status_code=409, detail=block_reason)
    books = load_books_for_chat(owner, payload.bookId, payload.bookIds)
    answer, sources_used = answer_question(payload.question, books)
    return {"success": True, "question": payload.question, "answer": answer, "sourcesUsed": sources_used}


@app.post("/chat/stream")
def chat_stream(
    payload: ChatRequest,
    x_guest_id: Annotated[str | None, Header(alias="x-guest-id")] = None,
    reszvault_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> StreamingResponse:
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question is required")
    owner = owner_key(reszvault_session, x_guest_id)
    block_reason = chat_block_reason(owner, payload.bookId, payload.bookIds)
    if block_reason:
        raise HTTPException(status_code=409, detail=block_reason)
    books = load_books_for_chat(owner, payload.bookId, payload.bookIds)
    answer, sources_used = answer_question(payload.question, books)

    def events():
        for char in answer:
            yield f"data: {json.dumps({'token': char})}\n\n"
        yield f"data: {json.dumps({'done': True, 'sourcesUsed': sources_used, 'answer': answer})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@app.get("/")
def root() -> dict:
    return {"name": "ReszVault Python API", "status": "ok"}
