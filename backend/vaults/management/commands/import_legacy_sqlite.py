import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone as utc
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from vaults.models import Account, AppSession, Book, Chunk, GithubSession, RepositoryIndex


def legacy_time(value):
    stamp = datetime.fromisoformat(value)
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=utc.utc)


class Command(BaseCommand):
    help = "Import accounts, PDFs, chunks, sessions, and indexes from a ReszVault SQLite backup."

    def add_arguments(self, parser):
        parser.add_argument("database", type=Path)
        parser.add_argument("--uploads-dir", type=Path)

    def handle(self, *args, **options):
        database = options["database"].resolve()
        uploads = options["uploads_dir"] or database.parent / "uploads"
        try:
            with closing(sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True)) as legacy:
                legacy.row_factory = sqlite3.Row
                legacy.execute("BEGIN")
                self.import_backup(legacy, uploads.resolve())
        except (sqlite3.Error, OSError, ValueError) as exc:
            raise CommandError(f"Could not read the legacy backup: {exc}") from exc
        self.stdout.write(self.style.SUCCESS("Legacy backup imported. Existing records were retained."))

    @transaction.atomic
    def import_backup(self, legacy, uploads):
        tables = {row[0] for row in legacy.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        if not {"books", "chunks", "users"} <= tables:
            raise CommandError("This file is missing the ReszVault users, books, or chunks table.")

        for row in legacy.execute("SELECT * FROM users"):
            Account.objects.get_or_create(id=row["id"], defaults={
                "name": row["name"], "email": row["email"], "image": row["image"],
                "password_hash": row["password_hash"], "created_at": legacy_time(row["created_at"]),
            })
        if "sessions" in tables:
            for row in legacy.execute("SELECT * FROM sessions"):
                AppSession.objects.get_or_create(token=row["token"], defaults={
                    "user_id": row["user_id"], "expires_at": legacy_time(row["expires_at"]),
                    "created_at": legacy_time(row["created_at"]),
                })
        if "github_sessions" in tables:
            for row in legacy.execute("SELECT * FROM github_sessions"):
                GithubSession.objects.get_or_create(
                    session_id=row["session_token"], defaults={"access_token": row["access_token"]}
                )

        for row in legacy.execute("SELECT * FROM books"):
            if Book.objects.filter(pk=row["id"]).exists():
                continue
            path = uploads / f"{row['id']}.pdf"
            raw = path.read_bytes() if path.resolve().is_relative_to(uploads) and path.is_file() else None
            interrupted = row["status"] == "processing"
            Book.objects.create(
                id=row["id"], owner_key=row["owner_key"], title=row["title"], filename=row["filename"],
                status="failed" if interrupted else row["status"],
                chunk_count=row["chunk_count"], pdf=raw, created_at=legacy_time(row["created_at"]),
                error="Indexing was interrupted before migration. Upload this PDF again." if interrupted else row["error"],
            )
        for row in legacy.execute("SELECT * FROM chunks"):
            Chunk.objects.get_or_create(id=row["id"], defaults={
                "book_id": row["book_id"], "content": row["content"], "chunk_index": row["chunk_index"],
                "page": row["page"] if "page" in row.keys() else 1, "created_at": legacy_time(row["created_at"]),
            })
        if "repository_indexes" in tables:
            for row in legacy.execute("SELECT * FROM repository_indexes"):
                RepositoryIndex.objects.get_or_create(repo_id=row["repo_id"], defaults={
                    "chunks": json.loads(row["chunks"]) if row["chunks"] else [],
                    "vectors": row["vectors"], "chunk_count": row["chunk_count"], "synced_at": row["synced_at"],
                    "stale": row["stale"], "error": bool(row["error"]),
                })
