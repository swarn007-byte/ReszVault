from __future__ import annotations

import re
from io import BytesIO
from typing import Iterable

from pypdf import PdfReader


MAX_CHUNKS = 120


def extract_pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    pages: list[str] = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return re.sub(r"\s+", " ", "\n".join(pages)).strip()


def split_text(text: str, chunk_size: int = 900, overlap: int = 120) -> list[str]:
    clean = re.sub(r"\s+", " ", text).strip()
    if not clean:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(clean) and len(chunks) < MAX_CHUNKS:
        end = min(len(clean), start + chunk_size)
        window = clean[start:end]
        if end < len(clean):
            boundary = max(window.rfind(". "), window.rfind("? "), window.rfind("! "), window.rfind("; "))
            if boundary > chunk_size * 0.55:
                end = start + boundary + 1
                window = clean[start:end]
        chunk = window.strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(clean):
            break
        start = max(0, end - overlap)
    return chunks


def split_pdf_text(pdf_bytes: bytes) -> list[str]:
    return split_text(extract_pdf_text(pdf_bytes))


def compact_text(text: str, limit: int = 1800) -> str:
    seen: set[str] = set()
    sentences = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text).strip())
    compacted: list[str] = []
    for sentence in sentences:
        key = re.sub(r"[^a-z0-9]+", " ", sentence.lower()).strip()
        if len(key) < 8 or key in seen:
            continue
        seen.add(key)
        compacted.append(sentence.strip())
        if sum(len(item) for item in compacted) >= limit:
            break
    return " ".join(compacted)[:limit] if compacted else text[:limit]


def source_chunks(title: str, chunks: Iterable[str]) -> list[str]:
    return [
        f'<source name="{title}" chunk="{index}">\n{compact_text(chunk)}\n</source>'
        for index, chunk in enumerate(chunks, start=1)
    ]
