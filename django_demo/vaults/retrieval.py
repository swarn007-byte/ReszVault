import os

from rag import build_prompt, groq_complete, tokenize_text

from .models import Chunk

STOP_WORDS = frozenset("a an are at be by can do for from how i in is it of on or the to was what when where which who with you".split())
NO_MATCH = "No matching passage was found in this vault."


def search_sources(vault, question, limit=3):
    terms = set(tokenize_text(question)) - STOP_WORDS
    if not terms:
        return []

    matches = []
    chunks = Chunk.objects.filter(source__vault=vault).select_related("source")
    for chunk in chunks:
        score = len(terms.intersection(tokenize_text(chunk.text)))
        if score:
            matches.append((score, chunk))
    matches.sort(key=lambda match: match[0], reverse=True)

    return [
        {"title": chunk.source.title, "page": chunk.page, "text": chunk.text}
        for _, chunk in matches[:limit]
    ]


def answer_question(vault, question):
    passages = search_sources(vault, question)
    if not passages:
        return {"answer": NO_MATCH, "sources": []}

    excerpts = [
        f"{passage['title']}, page {passage['page']}: {passage['text']}"
        for passage in passages
    ]
    generated = None
    if os.getenv("RESZVAULT_DEMO_USE_GROQ") == "1":
        generated = groq_complete(build_prompt(question, "\n\n".join(excerpts)))
    return {"answer": generated or "\n\n".join(excerpts), "sources": passages}
