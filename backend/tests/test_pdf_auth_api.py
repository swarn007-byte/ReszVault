import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from vaults.authentication import code_challenge
from vaults.models import Account, Book, Chunk

PDF_DIR = Path(__file__).resolve().parents[2] / "frontend" / "e2e" / "fixtures"


class PDFWorkflowTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.guest = {"x-guest-id": "testing_guest_a"}
        self.other_guest = {"x-guest-id": "testing_guest_b"}
        patcher = patch.dict(os.environ, {"GROQ_API_KEY": "", "RESZVAULT_LOCAL_EMBEDDINGS": "0"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def upload(self, fixture, headers=None):
        document = SimpleUploadedFile(fixture, (PDF_DIR / fixture).read_bytes(), content_type="application/pdf")
        result = self.api.post("/books/upload", {"file": document}, headers=headers or self.guest)
        self.assertEqual(result.status_code, 202, result.data)
        return result.data["book"]

    def ask(self, book_ids, question="What is the return window?", headers=None):
        return self.api.post(
            "/chat", {"question": question, "bookIds": book_ids}, format="json", headers=headers or self.guest
        )

    def test_upload_scoped_chat_and_delete(self):
        returns = self.upload("return-policy.pdf")
        shipping = self.upload("shipping-guide.pdf")
        self.assertEqual(returns["status"], "ready")
        self.assertEqual(bytes(Book.objects.get(pk=returns["id"]).pdf), (PDF_DIR / "return-policy.pdf").read_bytes())
        self.assertEqual(Chunk.objects.get(book_id=returns["id"]).page, 1)
        self.assertIn("30 days from delivery", self.ask([returns["id"]]).data["answer"])
        unsupported = self.ask([returns["id"]], "What is the warranty window?")
        self.assertEqual(unsupported.data["sourcesUsed"], 0)

        for result in (self.ask([shipping["id"]]), self.ask([]), self.ask([returns["id"]], headers=self.other_guest)):
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.data["sourcesUsed"], 0)
            self.assertNotIn("30 days", result.data["answer"])
        self.assertEqual(self.api.get(f"/books/{returns['id']}", headers=self.other_guest).status_code, 404)
        self.assertEqual(self.api.delete(f"/books/{returns['id']}", headers=self.guest).status_code, 200)
        self.assertFalse(Chunk.objects.filter(book_id=returns["id"]).exists())

    def test_multi_pdf_chat_compares_only_selected_owned_documents(self):
        returns = self.upload("return-policy.pdf")
        short = self.upload("short-return-policy.pdf")
        hidden = self.upload("short-return-policy.pdf", headers=self.other_guest)
        Book.objects.filter(pk=hidden["id"]).update(title="Unowned fixture")
        self.assertIn("30 days", self.ask([returns["id"], hidden["id"]]).data["answer"])

        response = self.ask([returns["id"], short["id"], hidden["id"]])
        self.assertEqual(response.status_code, 200)
        self.assertIn("return-policy (page 1)", response.data["answer"])
        self.assertIn("short-return-policy (page 1)", response.data["answer"])
        self.assertNotIn("Unowned fixture", response.data["answer"])

    def test_stream_uses_frontend_event_format(self):
        book = self.upload("return-policy.pdf")
        result = self.api.post(
            "/chat/stream", {"question": "What is the return window?", "bookIds": [book["id"]]},
            format="json", headers=self.guest,
        )
        self.assertEqual(result.status_code, 200)
        events = [json.loads(line[6:]) for line in b"".join(result.streaming_content).decode().splitlines() if line]
        self.assertIn("30 days", "".join(event["token"] for event in events[:-1]))
        self.assertTrue(events[-1]["done"])


class AuthenticationTests(TestCase):
    def setUp(self):
        self.api = APIClient()

    def test_email_account_session_and_signout(self):
        payload = {"email": "demo@example.com", "password": "a-strong-fixture-password", "name": "Demo"}
        created = self.api.post("/api/auth/sign-up/email", payload, format="json")
        self.assertEqual(created.status_code, 200)
        account = Account.objects.get(email=payload["email"])
        self.assertNotEqual(account.password_hash, payload["password"])
        signed_in = self.api.post("/api/auth/sign-in/email", payload, format="json")
        headers = {"x-session-token": signed_in.data["data"]["session"]["token"]}
        self.assertEqual(self.api.get("/api/auth/session", headers=headers).data["user"]["id"], account.id)
        self.api.post("/api/auth/sign-out", {}, format="json", headers=headers)
        self.assertIsNone(self.api.get("/api/auth/session", headers=headers).data["user"])

    @patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "fixture", "GOOGLE_CLIENT_SECRET": "fixture"})
    @patch("vaults.account_views.google_profile", return_value={
        "email": "oauth@example.com", "email_verified": True, "name": "OAuth Demo",
    })
    def test_google_handoff_is_bound_and_consumed_once(self, profile):
        verifier = "a" * 64
        initial = self.api.get("/api/auth/google/start", {"challenge": code_challenge(verifier)})
        params = parse_qs(urlsplit(initial.url).query)
        state = params["state"][0]
        self.assertEqual(params["code_challenge_method"], ["S256"])
        callback = self.api.get("/api/auth/google/callback", {"code": "fixture", "state": state})
        fragment = parse_qs(urlsplit(callback.url).fragment)
        handoff = fragment["google_code"][0]
        profile.assert_called_once()
        url = "/api/auth/google/exchange"
        self.assertEqual(self.api.post(url, {"code": handoff, "verifier": "b" * 64}, format="json").status_code, 401)
        body = {"code": handoff, "verifier": verifier}
        self.assertEqual(self.api.post(url, body, format="json").status_code, 200)
        self.assertEqual(self.api.post(url, body, format="json").status_code, 401)

    @patch.dict(os.environ, {
        "GITHUB_CLIENT_ID": "fixture", "GITHUB_CLIENT_SECRET": "fixture", "GITHUB_APP_SLUG": "fixture",
    })
    @patch("github_research.github_request")
    def test_github_handoff_creates_repository_session(self, github_request):
        github_request.side_effect = [{"access_token": "fixture"}, {"id": 42, "login": "fixture"}]
        verifier = "a" * 64
        start = self.api.get("/api/auth/github/start", {"challenge": code_challenge(verifier)})
        state = parse_qs(urlsplit(start.url).query)["state"][0]
        callback = self.api.get("/api/auth/github/callback", {"code": "fixture", "state": state})
        code = parse_qs(urlsplit(callback.url).fragment)["github_code"][0]
        auth = self.api.post("/api/auth/github/exchange", {"code": code, "verifier": verifier}, format="json")
        self.assertEqual(auth.data["data"]["user"]["id"], "github_42")
        headers = {"x-session-token": auth.data["data"]["session"]["token"]}
        self.assertEqual(self.api.get("/api/github/access", headers=headers).status_code, 200)
