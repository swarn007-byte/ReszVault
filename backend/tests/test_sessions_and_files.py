import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import main
import storage


class SessionAndFileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        data = Path(self.temp.name)
        uploads = data / "uploads"
        for target, value in [
            ("storage.DATA_DIR", data),
            ("storage.UPLOAD_DIR", uploads),
            ("storage.DB_PATH", data / "test.sqlite3"),
            ("main.UPLOAD_DIR", uploads),
        ]:
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        storage.init_db()
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def test_header_session_and_signout_without_cookies(self):
        result = self.client.post("/api/auth/sign-up/email", json={
            "name": "Researcher", "email": "researcher@example.invalid", "password": "research-password",
        }).json()
        token = result["data"]["session"]["token"]
        self.client.cookies.clear()
        headers = {"x-session-token": token}
        self.assertEqual(self.client.get("/api/auth/session", headers=headers).json()["user"]["email"], "researcher@example.invalid")
        self.assertTrue(self.client.post("/api/auth/sign-out", headers=headers).json()["success"])
        self.assertIsNone(self.client.get("/api/auth/session", headers=headers).json()["user"])

    def test_pdf_preview_requires_the_source_owner(self):
        path = storage.UPLOAD_DIR / "source.pdf"
        path.write_bytes(b"%PDF-1.4\n%%EOF\n")
        with storage.db() as conn:
            conn.execute(
                "INSERT INTO books (id, owner_key, title, filename, status, chunk_count, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ("private-source", "guest:research-owner", "Source", "source.pdf", "ready", 1, str(path), storage.utc_now()),
            )
        allowed = self.client.get("/books/private-source/file", headers={"x-guest-id": "research-owner"})
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.content, path.read_bytes())
        self.assertEqual(allowed.headers["content-type"], "application/pdf")
        self.assertEqual(self.client.get("/books/private-source/file", headers={"x-guest-id": "another-owner"}).status_code, 404)
        self.assertEqual(self.client.get("/books/private-source/file").status_code, 401)


if __name__ == "__main__":
    unittest.main()
