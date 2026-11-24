import os
from unittest.mock import patch

from django.test import SimpleTestCase

from document_parser import Chunk
from pdf_comparison import answer_from_vault
from rag import BookContext


def policy(title, days, *, scope=None, effective=None):
    chunks = [Chunk(text=f"The return window is {days} days from delivery.", page=2)]
    if scope:
        chunks.append(Chunk(text=f"Scope: {scope}.", page=3))
    if effective:
        chunks.append(Chunk(text=f"Effective date: {effective}.", page=4))
    return BookContext(id=title, title=title, chunks=chunks)


@patch.dict(os.environ, {"RESZVAULT_LOCAL_EMBEDDINGS": "0", "GROQ_API_KEY": ""})
class PDFComparisonTests(SimpleTestCase):
    def test_unresolved_conflict_cites_both_policies(self):
        books = [policy("Short Policy", 15), policy("Long Policy", 30)]
        answer, sources = answer_from_vault("Compare all return window policies. Is the return window 15 or 30 days?", books)
        self.assertIn("do not establish which rule applies", answer)
        self.assertIn("Short Policy (page 2):** The return window is 15 days", answer)
        self.assertIn("Long Policy (page 2):** The return window is 30 days", answer)
        self.assertEqual(sources, 2)

    def test_as_of_date_selects_latest_active_policy_for_same_scope(self):
        books = [
            policy("Original", 15, scope="online orders", effective="2025-01-01"),
            policy("Revised", 30, scope="online orders", effective="2025-06-01"),
            policy("Future", 45, scope="online orders", effective="2026-01-01"),
        ]
        answer, _ = answer_from_vault("What is the return window for online orders as of 2025-07-01?", books)
        self.assertIn("For online orders as of 2025-07-01, **Revised**", answer.splitlines()[0])
        self.assertIn("Revised (page 4):** Effective date: 2025-06-01", answer)
        self.assertIn("Original (page 2)", answer)
        self.assertIn("Future (page 2)", answer)

    def test_scope_selects_the_matching_order_type(self):
        books = [policy("Store Policy", 15, scope="store purchases"), policy("Online Policy", 30, scope="online orders")]
        answer, _ = answer_from_vault("What is the return window for online orders?", books)
        self.assertIn("For online orders, **Online Policy**", answer.splitlines()[0])
        self.assertIn("Online Policy (page 3):** Scope: online orders", answer)
        self.assertIn("Store Policy (page 2)", answer)

    def test_unmatched_scope_keeps_conflict_unresolved(self):
        books = [
            policy("Original", 15, scope="online orders", effective="2025-01-01"),
            policy("Revised", 30, scope="online orders", effective="2025-06-01"),
        ]
        answer, _ = answer_from_vault("What is the return window for store purchases as of 2025-07-01?", books)
        self.assertIn("do not establish which rule applies", answer)


    def test_expiry_requires_more_context_than_effective_date_alone(self):
        old = policy("Original", 15, scope="online orders", effective="2025-01-01")
        updated = policy("Revised", 30, scope="online orders", effective="2025-06-01")
        updated.chunks.append(Chunk(text="Valid until 2025-06-30.", page=4))
        answer, _ = answer_from_vault("What is the return window for online orders as of 2025-07-01?", [old, updated])
        self.assertIn("do not establish which rule applies", answer)
