import base64
import hashlib
import hmac
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import github_research
import repository_index as index
import storage


class RepositoryIndexTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        path = Path(self.directory.name)
        for name, value in {"DATA_DIR": path, "UPLOAD_DIR": path / "uploads", "DB_PATH": path / "db.sqlite3"}.items():
            patcher = patch.object(storage, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        storage.init_db()

    def fixture(self, path, token=None, **kwargs):
        base = "/repos/acme/tools"
        if path.startswith(f"{base}/git/trees/"):
            return {"tree": [{"path": "README.md", "type": "blob", "size": 70, "sha": "doc"}]}
        if path == f"{base}/git/blobs/doc":
            return {"encoding": "base64", "content": base64.b64encode(
                b"# Setup\nUse the run script to initialize the SQLite database."
            ).decode()}
        if path.startswith(f"{base}/issues?"):
            return [{"state": "closed", "title": "Remove Redis", "body": "Redis complicated deployments.",
                     "html_url": "https://github.com/acme/tools/pull/42", "number": 42,
                     "pull_request": {"merged_at": "2026-04-01"}}]
        if path.startswith(f"{base}/pulls/comments?"):
            return [{"html_url": "https://github.com/acme/tools/pull/42#discussion_r17",
                     "path": "backend.py", "body": "Managed Redis was too expensive for maintainers."}]
        if path.startswith(f"{base}/issues/comments?") or "/reviews?" in path:
            return []
        if "/files?" in path:
            return [{"filename": "backend.py", "patch": "- import redis\n+ import sqlite3"}]
        raise AssertionError(path)

    def test_snapshot_retrieval_and_sync_lease(self):
        repo = {"id": 91, "full_name": "acme/tools", "html_url": "https://github.com/acme/tools",
                "size": 10, "default_branch": "main", "readable_ref": "fixture-ref", "private": False}
        key = index.index_key(repo)
        claim = index.claim_sync(key)
        self.assertIsNone(index.claim_sync(key, force=True))
        index.mark_stale(91)
        index.synchronize_repository(self.fixture, "token", repo, claim)
        self.assertEqual(index.index_status(key)["state"], "stale")
        claim = index.claim_sync(key)
        index.synchronize_repository(self.fixture, "token", repo, claim)
        self.assertEqual(index.index_status(key)["state"], "ready")
        self.assertIsNone(index.claim_sync(key))
        evidence = index.retrieve(key, "Why was Redis removed in PR #42?", [])
        self.assertIn("PR", {item.kind for item in evidence})
        self.assertIn("review comment", {item.kind for item in evidence})
        self.assertIn("diff", {item.kind for item in evidence})
        self.assertTrue(all(item.number == 42 for item in evidence))
        docs = index.retrieve(key, "initialize the SQLite database", [])
        self.assertIn("https://github.com/acme/tools/blob/fixture-ref/README.md#L1-L2", {item.url for item in docs})
        self.assertNotIn("doc", {item.kind for item in index.retrieve(key, "SQLite database", [], include_files=False)})
        self.assertFalse(index.retrieve(index.index_key({**repo, "id": 92}), "Redis", []))
        self.assertFalse(index.retrieve(index.index_key({**repo, "private": True}), "Redis", []))

    def test_authenticated_chat_uses_index_and_keeps_private_evidence_local(self):
        app = FastAPI()
        github_research.register_github_routes(app, None)
        client = TestClient(app)
        with storage.db() as conn:
            conn.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)",
                         ("user", "Contributor", "user@example.com", None, None, storage.utc_now()))
            conn.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)",
                         ("session", "user", "2099-01-01", storage.utc_now()))
            conn.execute("INSERT INTO github_sessions VALUES (?, ?)", ("session", "token"))

        repo = {"id": 91, "full_name": "acme/tools", "html_url": "https://github.com/acme/tools",
                "default_branch": "main", "size": 10, "private": True}
        def provider(path, token=None, **kwargs):
            self.assertEqual(token, "token")
            if path == "/repos/acme/tools":
                return dict(repo)
            if path == "/repos/acme/tools/commits/main":
                return {"sha": "fixture-ref"}
            if path.startswith(("/search/issues?", "/repos/acme/tools/pulls?")):
                return {"items": []} if path.startswith("/search") else []
            return self.fixture(path, token, **kwargs)

        headers = {"x-session-token": "session"}
        with patch.object(github_research, "github_request", provider), patch.object(github_research, "groq_complete") as model:
            url = "/api/github/repositories/acme/tools/index"
            self.assertEqual(client.post(url).status_code, 401)
            self.assertEqual(client.post(url, headers=headers).json()["state"], "syncing")
            self.assertEqual(client.get(url, headers=headers).json()["state"], "ready")
            response = client.post("/api/github/chat", headers=headers, json={
                "repository": "acme/tools", "question": "How do I initialize the SQLite database?",
            })
            self.assertEqual(response.status_code, 200)
            self.assertIn("Use the run script", response.json()["answer"])
            self.assertIn("README.md", {source["title"] for source in response.json()["sources"]})
            model.assert_not_called()

    def test_signed_webhook_invalidates_index(self):
        key = "91:public"
        index.claim_sync(key)
        app = FastAPI()
        github_research.register_github_routes(app, None)
        client = TestClient(app)
        payload = json.dumps({"repository": {"id": 91}}).encode()
        signature = "sha256=" + hmac.new(b"fixture-secret", payload, hashlib.sha256).hexdigest()
        url = "/api/github/webhook"
        with patch.dict(os.environ, {"GITHUB_WEBHOOK_SECRET": "fixture-secret"}):
            denied = client.post(url, content=payload, headers={"x-github-event": "push"})
            self.assertEqual(denied.status_code, 401)
            result = client.post(url, content=payload, headers={"x-github-event": "push",
                                                                "x-hub-signature-256": signature})
        self.assertEqual(result.status_code, 202)
        with storage.db() as conn:
            row = conn.execute("SELECT stale FROM repository_indexes WHERE repo_id = ?", (key,)).fetchone()
            self.assertEqual(row["stale"], 1)


if __name__ == "__main__":
    unittest.main()
