from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient


class VaultAskTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=StringIO())

    @patch.dict("os.environ", {"RESZVAULT_DEMO_USE_GROQ": "0"})
    def test_admin_session_does_not_require_csrf_for_read_only_demo(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(get_user_model().objects.create_user(username="demo-admin", is_staff=True))
        response = client.post(
            reverse("demo-vault-ask", args=["returns"]),
            {"question": "What is the return window?"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sources"][0]["page"], 1)
        self.assertIn("30 days from delivery", response.data["sources"][0]["text"])
