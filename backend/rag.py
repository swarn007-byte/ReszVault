from __future__ import annotations

import json
import os
import re
import urllib.request
from dataclasses import dataclass
from typing import Iterable

from document_parser import compact_text, source_chunks


OFF_TOPIC_REPLY = "ahn !! my mother didn't taught me about this"
MISSING_REPLY = "I could not find that in the uploaded sources."


@dataclass
class BookContext:
    id: str
    title: str
    chunks: list[str]


def tokenize(text: str) -> list[str]:
    return [
        word
        for word in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split()
        if len(word) > 2
    ]


def is_clearly_off_topic(question: str) -> bool:
    if re.search(r"\b(reszvault|research|document|pdf|source|citation|summary|paper|report|resume|vault|dsa|question)\b", question, re.I):
        return False
    return bool(
        re.search(
            r"\b(israel|gaza|trump|biden|modi|putin|election|president|crypto|bitcoin|weather|recipe|football|nba|iphone|android)\b",
            question,
            re.I,
        )
    )


def wants_source_inventory(question: str) -> bool:
    if re.search(r"\b(not described|missing|not present|not included|not found)\b", question, re.I):
        return False
    return bool(
        re.search(r"\b(list|show)\b.*\b(resources|sources|pdfs|documents|docs)\b", question, re.I)
        or re.search(r"\b(what|which)\b.*\b(resources|sources|pdfs|documents|docs)\b.*\b(have|available|uploaded|indexed)\b", question, re.I)
        or re.search(r"\b(available|uploaded|indexed)\b.*\b(resources|sources|pdfs|documents|docs)\b", question, re.I)
    )


def wants_project_summary(question: str) -> bool:
    return bool(re.search(r"\b(summarize|summary|overview)\b", question, re.I) and re.search(r"\b(project|vault|all|sources|documents|docs)\b", question, re.I))


def wants_full_list(question: str) -> bool:
    return bool(re.search(r"\b(all|list|every|complete|give me all|show all)\b", question, re.I))


def retrieve_chunks(chunks: list[str], question: str, force_all: bool = False) -> list[str]:
    if force_all:
        return chunks[:40]
    terms = set(tokenize(question))
    if not terms:
        return chunks[:6]

    scored: list[tuple[float, str]] = []
    for chunk in chunks:
        chunk_terms = tokenize(chunk)
        if not chunk_terms:
            continue
        hits = sum(1 for term in chunk_terms if term in terms)
        phrase_bonus = 2 if any(term in chunk.lower() for term in terms) else 0
        score = (hits + phrase_bonus) / max(1, len(set(chunk_terms)) ** 0.5)
        scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    picked = [chunk for score, chunk in scored[:8] if score > 0]
    return picked or chunks[:2]


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


def prepare_context(question: str, books: list[BookContext]) -> tuple[str, int] | str:
    if not books:
        return "Upload one or more PDFs first, then I can answer from your sources."

    if wants_source_inventory(question):
        return "\n".join(["Available source documents:", *[f"{i}. {book.title}" for i, book in enumerate(books, 1)]])

    if wants_project_summary(question):
        return extractive_project_summary(books)

    force_all = wants_full_list(question)
    context_parts = [f"Available source documents: {', '.join(book.title for book in books)}"]
    used = 0
    for book in books:
        picked = retrieve_chunks(book.chunks, question, force_all=force_all)
        used += len(picked)
        context_parts.extend(source_chunks(book.title, picked))

    if used == 0:
        return MISSING_REPLY
    return "\n\n".join(context_parts), used


def build_prompt(question: str, context: str) -> str:
    return f"""You are ReszVault, a strict source-grounded research assistant.

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
    if is_clearly_off_topic(question):
        return OFF_TOPIC_REPLY

    fixed_or_context = prepare_context(question, books)
    if isinstance(fixed_or_context, str):
        return fixed_or_context

    context, _used = fixed_or_context
    lines: list[str] = []
    for book in books:
        picked = retrieve_chunks(book.chunks, question, force_all=wants_full_list(question))
        if not picked:
            continue
        lines.append(f"### {book.title}")
        for sentence in re.split(r"(?<=[.!?])\s+", compact_text(" ".join(picked), 2200)):
            sentence = sentence.strip()
            if len(sentence) > 18:
                lines.append(f"- {sentence}")
    return "\n".join(lines).strip() or MISSING_REPLY


def answer_question(question: str, books: list[BookContext]) -> tuple[str, int]:
    if is_clearly_off_topic(question):
        return OFF_TOPIC_REPLY, 0

    fixed_or_context = prepare_context(question, books)
    if isinstance(fixed_or_context, str):
        return fixed_or_context, len(books)

    context, used = fixed_or_context
    answer = groq_complete(build_prompt(question, context))
    if not answer:
        answer = extractive_answer(question, books)
    if re.search(r"\b(i'?m a fool|am i fool)\b", answer, re.I):
        answer = OFF_TOPIC_REPLY
    return answer.strip(), used
