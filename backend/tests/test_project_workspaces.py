from dataclasses import asdict
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from repository_index import Evidence
from vaults.http import RequestError
from vaults.models import Account, AppSession, RepositoryIndex


PDF = Path(__file__).resolve().parents[2] / "frontend/e2e/fixtures/return-policy.pdf"
REPOSITORY = {
    "id": 123, "full_name": "example/returns", "private": False, "readable_ref": "test-ref",
}


class ProjectWorkspaceTests(TestCase):
    def setUp(self):
        self.client = self.session("first")
        self.first = self.create_project("Returns")
        self.second = self.create_project("New project")

    @staticmethod
    def session(name):
        account = Account.objects.create(id=name, name=name, email=f"{name}@example.com")
        AppSession.objects.create(token=f"token-{name}", user=account, expires_at=timezone.now() + timedelta(days=1))
        return APIClient(HTTP_X_SESSION_TOKEN=f"token-{name}")

    def create_project(self, name):
        response = self.client.post("/api/projects", {"name": name}, format="json")
        self.assertEqual(response.status_code, 201)
        return f"/api/projects/{response.json()['id']}"

    def upload(self):
        return self.client.post(f"{self.first}/pdfs", {
            "file": SimpleUploadedFile(PDF.name, PDF.read_bytes(), content_type="application/pdf"),
        })

    def test_project_sources_and_chat_are_owner_scoped(self):
        uploaded = self.upload()
        self.assertEqual(uploaded.status_code, 201)
        self.assertEqual(self.client.get(self.first).json()["pdfs"][0]["id"], uploaded.json()["id"])
        self.assertEqual(self.client.get(self.second).json()["pdfs"], [])
        self.assertEqual(self.client.get("/books").json()["books"], [])
        self.assertEqual(self.client.get(f"/books/{uploaded.json()['id']}").status_code, 404)

        other = self.session("second")
        self.assertEqual(other.get("/api/projects").json(), [])
        self.assertEqual(other.get(self.first).status_code, 404)
        self.assertEqual(other.post(f"{self.first}/chat", {"question": "What is in the PDF?"}).status_code, 404)

    @patch("vaults.project_chat.groq_complete", return_value=None)
    @patch("vaults.project_chat.accessible_repository", return_value=REPOSITORY)
    @patch("vaults.project_views.start_sync")
    @patch("vaults.project_views.accessible_repository", return_value=REPOSITORY)
    def test_follow_up_retrieves_both_pdf_and_github_excerpts(self, check_attachment, sync, check_chat, generate):
        self.assertEqual(self.upload().status_code, 201)
        RepositoryIndex.objects.create(repo_id="123:public", synced_at=int(timezone.now().timestamp()),
            chunk_count=1, chunks=[asdict(Evidence("doc", "README.md",
                "https://github.com/example/returns/blob/main/README.md",
                "The return window is 30 days from delivery. The service validates delivery dates."))])
        endpoint = f"{self.first}/repositories"
        payload = {"repository": "example/returns"}
        self.assertEqual(self.client.post(endpoint, payload).status_code, 201)
        self.assertEqual(self.client.post(endpoint, payload).status_code, 200)
        self.assertEqual(len(self.client.get(self.first).json()["repositories"]), 1)
        self.assertEqual(self.client.get(self.second).json()["repositories"], [])

        response = self.client.post(f"{self.first}/chat", {
            "question": "How does this repo relate to the uploaded PDF?",
            "previous_questions": ["How does the return window work?"],
        }, format="json")
        self.assertEqual(response.status_code, 200)
        answer = response.json()
        self.assertIn("30 days from delivery", answer["answer"])
        self.assertTrue(any(source["kind"] == "pdf" and source["page"] == 1 for source in answer["sources"]))
        self.assertTrue(any(source["url"].endswith("/README.md") for source in answer["sources"]))
        check_chat.assert_called_once()
        generate.assert_called_once()

    @patch("vaults.project_chat.groq_complete")
    @patch("vaults.project_chat.accessible_repository", side_effect=RequestError(403, "Access revoked"))
    def test_revoked_private_repository_never_uses_cached_excerpts(self, check_access, generate):
        from vaults.models import Project, ProjectRepository

        project = Project.objects.get(name="Returns")
        ProjectRepository.objects.create(project=project, index_key="987:private", name="example/private")
        RepositoryIndex.objects.create(repo_id="987:private", synced_at=int(timezone.now().timestamp()),
            chunk_count=1, chunks=[asdict(Evidence("code", "private.py",
                "https://github.com/example/private/blob/main/private.py", "Private archive evidence"))])

        response = self.client.post(f"{self.first}/chat", {"question": "What is in the repository?"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["sources"], [])
        self.assertEqual(response.json()["unavailable"], ["example/private"])
        check_access.assert_called_once()
        generate.assert_not_called()
