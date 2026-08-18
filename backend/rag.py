"""
RAG core for a multi-PDF question-answering app.

Requires:
    pip install sentence-transformers numpy

Design:
- Ingestion (elsewhere, in document_parser.py): PDFs -> text -> chunks.
- This file: embed chunks once per book, embed each question, retrieve by
  cosine similarity across ALL uploaded books (not per-book keyword loops),
  then ask an LLM to answer strictly from the retrieved context.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np

from document_parser import compact_text, source_chunks


MISSING_REPLY = "I could not find that in the uploaded sources."
NO_BOOKS_REPLY = "Upload one or more PDFs first, then I can answer from your sources."

EMBED_MODEL_NAME = os.getenv("RAG_EMBED_MODEL", "all-MiniLM-L6-v2")
TOP_K = 6
# Cosine similarity floor (embeddings are normalized, so this is a dot product).
# Chunks scoring below this are treated as not actually relevant -- this is
# what replaces the old hardcoded off-topic keyword blocklist.
MIN_SIMILARITY = 0.30


@dataclass
class BookContext:
    id: str
    title: str
    chunks: list[str]
    chunk_embeddings: np.ndarray | None = field(default=None, repr=False)


@dataclass
class ContextResult:
    """
    Output of prepare_context().

    is_final_answer=True means `text` should be returned to the user as-is
    (no LLM call needed) -- e.g. "no PDFs uploaded", a source list, or
    "nothing relevant found". is_final_answer=False means `text` is context
    to feed into the LLM prompt.
    """
    text: str
    used_chunks: int
    is_final_answer: bool = False


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _get_embedder():
    """Load the embedding model once per process (lazy, so import stays cheap)."""
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(EMBED_MODEL_NAME)


def embed_texts(texts: list[str]) -> np.ndarray:
    """Embed a list of strings into normalized vectors (cosine sim = dot product)."""
    if not texts:
        return np.zeros((0, 384), dtype=np.float32)
    model = _get_embedder()
    vectors = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    return vectors.astype(np.float32)


def ensure_book_embeddings(book: BookContext) -> None:
    """Compute and cache chunk embeddings for a book if not already done."""
    if book.chunk_embeddings is not None and len(book.chunk_embeddings) == len(book.chunks):
        return
    book.chunk_embeddings = embed_texts(book.chunks)


def cosine_scores(query_vec: np.ndarray, chunk_vecs: np.ndarray) -> np.ndarray:
    if chunk_vecs.shape[0] == 0:
        return np.zeros((0,), dtype=np.float32)
    return chunk_vecs @ query_vec  # already normalized -> dot product == cosine sim


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

def retrieve_chunks(
    book: BookContext,
    query_vec: np.ndarray,
    force_all: bool = False,
    top_k: int = TOP_K,
) -> list[tuple[float, str]]:
    """Top-k (score, chunk) pairs for a single book."""
    if force_all:
        return [(1.0, chunk) for chunk in book.chunks[:40]]

    ensure_book_embeddings(book)
    scores = cosine_scores(query_vec, book.chunk_embeddings)
    if scores.shape[0] == 0:
        return []
    ranked_indices = np.argsort(-scores)[:top_k]
    return [
        (float(scores[i]), book.chunks[i])
        for i in ranked_indices
        if scores[i] >= MIN_SIMILARITY
    ]


def retrieve_across_books(
    question: str,
    books: list[BookContext],
    force_all: bool = False,
    top_k: int = TOP_K,
) -> list[tuple[float, str, str]]:
    """Retrieve top chunks ranked GLOBALLY across all books. Returns (score, title, chunk)."""
    query_vec = embed_texts([question])[0]
    pooled: list[tuple[float, str, str]] = []
    for book in books:
        for score, chunk in retrieve_chunks(book, query_vec, force_all=force_all, top_k=top_k):
            pooled.append((score, book.title, chunk))
    pooled.sort(key=lambda item: item[0], reverse=True)
    return pooled if force_all else pooled[:top_k]


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\s+[•◦–-]\s+", re.sub(r"\s+", " ", text).strip())
    return [part.strip() for part in parts if len(part.strip()) > 8]


# ---------------------------------------------------------------------------
# Question intent (kept: these classify the QUESTION, not hardcoded document facts)
# ---------------------------------------------------------------------------

def wants_source_inventory(question: str) -> bool:
    compact = question.strip().lower()
    if compact in {"source", "sources", "resource", "resources", "pdf", "pdfs", "docs", "documents"}:
        return True
    if re.search(r"\b(not described|missing|not present|not included|not found)\b", question, re.I):
        return False
    return bool(
        re.search(r"\b(list|show)\b.*\b(resources|sources|pdfs|documents|docs)\b", question, re.I)
        or re.search(r"\b(what|which)\b.*\b(resources|sources|pdfs|documents|docs)\b.*\b(have|available|uploaded|indexed)\b", question, re.I)
        or re.search(r"\b(available|uploaded|indexed)\b.*\b(resources|sources|pdfs|documents|docs)\b", question, re.I)
    )


def wants_project_summary(question: str) -> bool:
    return bool(
        re.search(r"\b(summarize|summary|overview)\b", question, re.I)
        and re.search(r"\b(project|vault|all|sources|documents|docs)\b", question, re.I)
    )


def wants_full_list(question: str) -> bool:
    return bool(re.search(r"\b(all|list|every|complete|give me all|show all)\b", question, re.I))


def is_fact_query(question: str) -> bool:
    return bool(
        re.search(
            r"\b(name|owner name|full name|dob|date of birth|birth|email|mail|phone|mobile|number|address|location|college|cgpa|gpa)\b",
            question,
            re.I,
        )
    )


# ---------------------------------------------------------------------------
# Context assembly
# ---------------------------------------------------------------------------

def extractive_project_summary(books: list[BookContext]) -> str:
    sections: list[str] = [
        f"Available source documents: {', '.join(book.title for book in books)}",
        "",
    ]
    for book in books:
        sentences = re.split(r"(?<=[.!?])\s+", compact_text(" ".join(book.chunks), 1400))
        facts = [sentence.strip() for sentence in sentences if len(sentence.strip()) > 24][:4]
        sections.append(f"### {book.title}")
        sections.extend([f"- {fact}" for fact in facts] or ["- No readable facts were extracted from this source."])
        sections.append("")
    return "\n".join(sections).strip()


def prepare_context(question: str, books: list[BookContext]) -> ContextResult:
    if not books:
        return ContextResult(NO_BOOKS_REPLY, 0, is_final_answer=True)

    if wants_source_inventory(question):
        listing = "\n".join(["Available source documents:", *[f"{i}. {book.title}" for i, book in enumerate(books, 1)]])
        return ContextResult(listing, len(books), is_final_answer=True)

    if wants_project_summary(question):
        return ContextResult(extractive_project_summary(books), len(books), is_final_answer=True)

    force_all = wants_full_list(question)
    results = retrieve_across_books(question, books, force_all=force_all)

    if not results:
        return ContextResult(MISSING_REPLY, 0, is_final_answer=True)

    grouped: dict[str, list[str]] = {}
    for _, title, chunk in results:
        grouped.setdefault(title, []).append(chunk)

    context_parts = [f"Available source documents: {', '.join(book.title for book in books)}"]
    for title, chunks in grouped.items():
        context_parts.extend(source_chunks(title, chunks))

    return ContextResult("\n\n".join(context_parts), len(results), is_final_answer=False)


def build_prompt(question: str, context: str) -> str:
    return f"""You are a strict source-grounded research assistant.

CORE RULES:
1. Answer using ONLY the provided context. Do not use outside knowledge.
2. If the answer is not present, say exactly: "{MISSING_REPLY}"
3. If asked what resources/sources/PDFs/documents are available, list source document names, not links/tools mentioned inside documents.
4. If asked for all items in a list, include every item explicitly present in the context.
5. Keep answers concise unless the user asks for a full list.

Context:
{context}

Question: {question}
"""


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

def groq_complete(prompt: str) -> str | None:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None

    payload = {
        "model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": "You answer only from supplied source context."},
            {"role": "user", "content": prompt},
        ],
    }
    request = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


def extractive_answer(question: str, books: list[BookContext]) -> str:
    """Fallback used when no GROQ_API_KEY is set or the API call fails."""
    result = prepare_context(question, books)
    if result.is_final_answer:
        return result.text

    force_all = wants_full_list(question)
    results = retrieve_across_books(question, books, force_all=force_all)

    candidates: list[tuple[str, str]] = []  # (title, sentence)
    for _, title, chunk in results:
        for sentence in split_sentences(compact_text(chunk, 900)):
            candidates.append((title, sentence))

    if not candidates:
        return MISSING_REPLY

    query_vec = embed_texts([question])[0]
    sentence_vecs = embed_texts([sentence for _, sentence in candidates])
    scores = cosine_scores(query_vec, sentence_vecs)

    ranked = sorted(zip(scores, candidates), key=lambda item: item[0], reverse=True)
    top = [item for item in ranked if item[0] >= MIN_SIMILARITY][:3]
    if not top:
        return MISSING_REPLY

    if is_fact_query(question):
        _, (title, sentence) = top[0]
        return f"From **{title}**: {sentence}"

    lines = [f"From **{title}**: {sentence}" for _, (title, sentence) in top]
    return "\n- " + "\n- ".join(lines)


def answer_question(question: str, books: list[BookContext]) -> tuple[str, int]:
    result = prepare_context(question, books)
    if result.is_final_answer:
        return result.text, result.used_chunks

    answer = groq_complete(build_prompt(question, result.text))
    if not answer:
        answer = extractive_answer(question, books)
    return answer.strip(), result.used_chunks