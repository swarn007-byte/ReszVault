import hashlib
import sqlite3
from datetime import datetime, timezone, timedelta
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from vaults.models import Account, Book, Chunk, RepositoryIndex


class LegacyImportTests(TestCase):
    def test_import_preserves_pdf_and_account_and_can_be_repeated(self):
        password = "legacy-fixture-passphrase"
        salt = "legacy-test-salt"
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 180_000).hex()
        now = datetime.now(timezone.utc)
        with TemporaryDirectory() as directory:
            backup = Path(directory) / "legacy.sqlite3"
            uploads = Path(directory) / "uploads"
            uploads.mkdir()
            fixture = b"%PDF-1.4 fixture bytes"
            (uploads / "book_legacy.pdf").write_bytes(fixture)
            with sqlite3.connect(backup) as legacy:
                legacy.executescript("""
                    CREATE TABLE users (id, name, email, image, password_hash, created_at);
                    CREATE TABLE sessions (token, user_id, expires_at, created_at);
                    CREATE TABLE books (id, owner_key, title, filename, status, chunk_count, error, created_at);
                    CREATE TABLE chunks (id, book_id, content, chunk_index, page, created_at);
                    CREATE TABLE repository_indexes (repo_id, chunks, vectors, chunk_count, synced_at, stale, error);
                """)
                legacy.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)", (
                    "user_legacy", "Legacy", "legacy@example.com", None,
                    f"pbkdf2_sha256${salt}${digest}", now.isoformat(),
                ))
                legacy.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)", (
                    "legacy-session", "user_legacy", (now + timedelta(days=1)).isoformat(), now.isoformat(),
                ))
                legacy.execute("INSERT INTO books VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (
                    "book_legacy", "user:user_legacy", "Legacy policy", "policy.pdf",
                    "ready", 1, None, now.isoformat(),
                ))
                legacy.execute("INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?)", (
                    "chunk_legacy", "book_legacy", "Returns within 30 days.", 0, 7, now.isoformat(),
                ))
                legacy.execute("INSERT INTO repository_indexes VALUES (?, ?, ?, ?, ?, ?, ?)", (
                    "1:public", "[]", None, 0, int(now.timestamp()), 0, 0,
                ))

            for _ in range(2):
                call_command("import_legacy_sqlite", backup, stdout=StringIO())
            self.assertEqual(bytes(Book.objects.get().pdf), fixture)
            self.assertEqual(Chunk.objects.get().page, 7)
            self.assertTrue(RepositoryIndex.objects.filter(pk="1:public").exists())

            api = APIClient()
            books = api.get("/books", headers={"x-session-token": "legacy-session"}).data["books"]
            self.assertEqual([book["id"] for book in books], ["book_legacy"])
            signed_in = api.post(
                "/api/auth/sign-in/email", {"email": "legacy@example.com", "password": password}, format="json"
            )
            self.assertEqual(signed_in.data["data"]["user"]["id"], "user_legacy")
            self.assertNotEqual(Account.objects.get().password_hash, f"pbkdf2_sha256${salt}${digest}")
