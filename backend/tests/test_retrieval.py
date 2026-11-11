import unittest
from unittest.mock import patch

from document_parser import Chunk
from rag import BookContext, MISSING_REPLY, answer_question


class OfflineRetrievalTests(unittest.TestCase):
    def setUp(self):
        self.books = [BookContext(id="station", title="Research station", chunks=[
            Chunk(text="The research station uses solar panels for power. Its battery stores energy at night.", page=1),
        ])]

    @patch("rag.groq_complete", return_value=None)
    @patch("rag.embed_texts", side_effect=OSError("Model download unavailable"))
    def test_answer_uses_actual_source_when_model_is_unavailable(self, _embed, _groq):
        answer, used = answer_question("What powers the research station?", self.books)
        self.assertIn("solar panels", answer)
        self.assertIn("Research station", answer)
        self.assertGreater(used, 0)

    @patch("rag.groq_complete", return_value=None)
    @patch("rag.embed_texts", side_effect=OSError("Model download unavailable"))
    def test_unrelated_question_does_not_invent_an_answer(self, _embed, _groq):
        answer, used = answer_question("Who won Wimbledon?", self.books)
        self.assertEqual(answer, MISSING_REPLY)
        self.assertEqual(used, 0)

    @patch("rag.embed_texts", side_effect=AssertionError("Summary should not load a model"))
    def test_summary_works_without_external_services(self, _embed):
        answer, used = answer_question("Summarize all project sources", self.books)
        self.assertIn("solar panels", answer)
        self.assertEqual(used, 1)


if __name__ == "__main__":
    unittest.main()
