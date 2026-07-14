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
COMMON_STOP_TERMS = {
    "what", "which", "tell", "give", "show", "from", "with", "this", "that", "have",
    "about", "your", "their", "there", "whose", "owner", "document", "documents",
    "source", "sources", "pdf", "pdfs", "vault", "project", "please",
}


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


def normalized_terms(text: str) -> set[str]:
    return {term for term in tokenize(text) if term not in COMMON_STOP_TERMS}


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


def is_fact_query(question: str) -> bool:
    return bool(
        re.search(
            r"\b(name|owner name|full name|candidate name|dob|date of birth|birth|email|mail|phone|mobile|number|address|college|cgpa)\b",
            question,
            re.I,
        )
    )


def expand_query_terms(question: str) -> set[str]:
    terms = normalized_terms(question)
    q = question.lower()
    if "owner name" in q or "full name" in q or re.search(r"\bname\b", q):
        terms.update({"name", "swarn", "shekhar", "issued", "summary", "candidate"})
    if re.search(r"\b(email|mail)\b", q):
        terms.update({"email", "gmail", "mail"})
    if re.search(r"\b(phone|mobile|contact|number)\b", q):
        terms.update({"phone", "mobile", "contact"})
    if re.search(r"\b(address|location)\b", q):
        terms.update({"address", "district", "state", "bihar"})
    if re.search(r"\b(dob|date of birth|birth)\b", q):
        terms.update({"dob", "birth", "date"})
    if re.search(r"\b(college|education|cgpa)\b", q):
        terms.update({"college", "education", "cgpa", "technology", "galgotia"})
    return terms


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\s+[•◦–-]\s+", re.sub(r"\s+", " ", text).strip())
    return [part.strip() for part in parts if len(part.strip()) > 8]


def sentence_score(sentence: str, terms: set[str]) -> float:
    sentence_terms = normalized_terms(sentence)
    if not sentence_terms:
        return 0.0
    overlap = len(sentence_terms & terms)
    if overlap == 0:
        return 0.0
    dense_bonus = overlap / max(1, len(sentence_terms) ** 0.5)
    phrase_bonus = 0.25 if any(term in sentence.lower() for term in terms) else 0.0
    return overlap + dense_bonus + phrase_bonus


def retrieve_chunks(chunks: list[str], question: str, force_all: bool = False) -> list[str]:
    if force_all:
        return chunks[:40]
    terms = expand_query_terms(question)
    if not terms:
        return []

    scored: list[tuple[float, str]] = []
    for chunk in chunks:
        chunk_terms = normalized_terms(chunk)
        if not chunk_terms:
            continue
        overlap = len(chunk_terms & terms)
        if overlap == 0:
            continue
        phrase_bonus = 0.75 if any(term in chunk.lower() for term in terms) else 0.0
        score = overlap + phrase_bonus + (overlap / max(1, len(chunk_terms) ** 0.5))
        scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    picked = [chunk for score, chunk in scored[:6] if score >= 1.1]
    return picked


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


def detect_name_candidates(text: str) -> list[str]:
    matches = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b", text)
    cleaned: list[str] = []
    for match in matches:
        normalized = re.sub(r"(vill|dist|state|address)$", "", match, flags=re.I).strip()
        normalized = re.sub(r"\s{2,}", " ", normalized)
        if len(normalized.split()) < 2:
            continue
        if normalized.lower() in {"portfolio github", "machine learning", "software engineering"}:
            continue
        if any(token in normalized.lower() for token in ("enrolment", "address", "summary", "education", "experience")):
            continue
        if normalized not in cleaned:
            cleaned.append(normalized)
    return cleaned


def extract_direct_fact(question: str, books: list[BookContext]) -> str | None:
    lower = question.lower()
    for book in books:
        text = " ".join(book.chunks)
        compact = re.sub(r"\s+", " ", text)

        if re.search(r"\b(owner name|full name|candidate name|name)\b", lower):
            names = detect_name_candidates(compact)
            if names:
                return f"The name in **{book.title}** is **{names[0]}**."

        if re.search(r"\b(email|mail)\b", lower):
            match = re.search(r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})", compact)
            if match:
                return f"The email in **{book.title}** is **{match.group(1)}**."

        if re.search(r"\b(phone|mobile|contact|number)\b", lower):
            match = re.search(r"(\+91[-\s]?\d{10}|\b\d{10}\b)", compact)
            if match:
                return f"The phone number in **{book.title}** is **{match.group(1)}**."

        if re.search(r"\b(dob|date of birth|birth)\b", lower):
            match = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", compact)
            if match:
                return f"The date of birth in **{book.title}** is **{match.group(1)}**."

        if re.search(r"\b(address|location)\b", lower):
            match = re.search(r"(Address\s*:?\s*[^.]{20,180})", compact, re.I)
            if match:
                return f"The address in **{book.title}** is: {match.group(1).strip()}."

        if re.search(r"\b(college|education|cgpa)\b", lower):
            sentences = split_sentences(compact)
            ranked = sorted(
                ((sentence_score(sentence, expand_query_terms(question)), sentence) for sentence in sentences),
                reverse=True,
            )
            picked = [sentence for score, sentence in ranked if score >= 1.1][:2]
            if picked:
                return f"From **{book.title}**:\n- " + "\n- ".join(picked)

    return None


def prepare_context(question: str, books: list[BookContext]) -> tuple[str, int] | str:
    if not books:
        return "Upload one or more PDFs first, then I can answer from your sources."

    if wants_source_inventory(question):
        return "\n".join(["Available source documents:", *[f"{i}. {book.title}" for i, book in enumerate(books, 1)]])

    if wants_project_summary(question):
        return extractive_project_summary(books)

    direct_fact = extract_direct_fact(question, books)
    if direct_fact:
        return direct_fact

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

    terms = expand_query_terms(question)
    ranked_sentences: list[tuple[float, str, str]] = []
    for book in books:
        picked = retrieve_chunks(book.chunks, question, force_all=wants_full_list(question))
        if not picked:
            continue
        for sentence in split_sentences(compact_text(" ".join(picked), 900)):
            score = sentence_score(sentence, terms)
            if score >= 1.1:
                ranked_sentences.append((score, book.title, sentence))

    ranked_sentences.sort(key=lambda item: item[0], reverse=True)
    if not ranked_sentences:
        return MISSING_REPLY

    top = ranked_sentences[:3]
    if is_fact_query(question):
        return f"From **{top[0][1]}**: {top[0][2]}"

    lines = [f"From **{title}**: {sentence}" for _, title, sentence in top]
    return "\n- " + "\n- ".join(lines)


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
