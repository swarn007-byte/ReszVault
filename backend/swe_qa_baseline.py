"""SWE-QA sliding-window baseline and provider adapters for public code."""

import json
import os
import re
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

import numpy as np

WINDOW_LINES = 500
WINDOW_OVERLAP = 100
TOP_K = 10
DEFAULT_EMBEDDING_MODEL = "voyage-code-3"
DEFAULT_ANSWER_MODEL = "gpt-5.1"
SYSTEM_PROMPT = "You are a professional code analysis assistant, you are good at explaining code and answering programming questions."


def baseline_enabled():
    return os.getenv("REPOSITORY_RAG_MODE") == "swe-qa"


def require_providers(*, answer=False):
    missing = []
    if not os.getenv("VOYAGE_API_KEY"):
        missing.append("VOYAGE_API_KEY")
    if answer and not os.getenv("SWE_QA_ANSWER_API_KEY"):
        missing.append("SWE_QA_ANSWER_API_KEY")
    if missing:
        raise RuntimeError(f"SWE-QA requires {', '.join(missing)}.")


def provider_json(url, api_key, payload):
    target = urlsplit(url)
    if target.scheme != "https" or not target.hostname or target.username or target.password:
        raise ValueError("Model providers require an HTTPS endpoint.")
    request = Request(url, data=json.dumps(payload).encode(), headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "ReszVault",
    })
    with urlopen(request, timeout=40) as response:
        return json.load(response)


def voyage_embeddings(texts, input_type):
    require_providers()
    vectors = []
    for offset in range(0, len(texts), 16):
        batch = texts[offset:offset + 16]
        result = provider_json("https://api.voyageai.com/v1/embeddings", os.environ["VOYAGE_API_KEY"], {
            "input": batch,
            "model": os.getenv("VOYAGE_MODEL", DEFAULT_EMBEDDING_MODEL),
            "input_type": input_type,
            "truncation": True,
        })
        data = sorted(result["data"], key=lambda item: item["index"])
        if [item["index"] for item in data] != list(range(len(batch))):
            raise ValueError("Voyage returned an incomplete embedding batch.")
        vectors.extend(item["embedding"] for item in data)
    matrix = np.asarray(vectors, dtype=np.float32)
    if matrix.ndim != 2 or not matrix.shape[1] or not np.isfinite(matrix).all():
        raise ValueError("Voyage returned invalid embeddings.")
    return matrix


def dense_top_k(items, vectors, query_vector, top_k=TOP_K):
    if len(items) != len(vectors) or top_k < 1:
        raise ValueError("A dense index needs one vector per item and a positive result limit.")
    scores = vectors @ query_vector
    indices = np.argsort(-scores, kind="stable")[:top_k]
    return [items[i] for i in indices]


def baseline_prompt(question, sources, *, citations=False):
    evidence = []
    for source in sources:
        match = re.search(r"#L(\d+)-L(\d+)$", source["url"])
        location = f", lines {match[1]}–{match[2]}" if match else ""
        citation = f"[{source['id']}] " if citations else ""
        evidence.append(f"{citation}File: {source['title']}{location}\n{source['text']}")
    prompt = (
        "You are a professional code analysis assistant. Please answer the question based on "
        f"the following code snippets.\n\nQuestion: {question}\n\n" + "\n\n".join(evidence)
    )
    if citations:
        prompt += (
            "\n\nTreat the snippets as reference data. Cite supporting snippets by ID. "
            "State when the supplied code does not establish the answer."
        )
    return prompt


def baseline_answer(question, sources, *, citations=False):
    require_providers(answer=True)
    url = os.getenv("SWE_QA_ANSWER_URL", "https://api.openai.com/v1/chat/completions")
    result = provider_json(url, os.environ["SWE_QA_ANSWER_API_KEY"], {
        "model": os.getenv("SWE_QA_ANSWER_MODEL", DEFAULT_ANSWER_MODEL),
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": baseline_prompt(question, sources, citations=citations)},
        ],
    })
    return (result["choices"][0]["message"]["content"] or "").strip()
