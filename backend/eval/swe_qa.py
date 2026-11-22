"""Run ReszVault retrieval against a pinned SWE-QA source tree."""

import argparse
import json
import os
import re
import subprocess
from pathlib import Path

from github_research import evidence_payload, repository_answer_prompt
from rag import embed_texts, groq_complete
from swe_qa_baseline import baseline_answer, dense_top_k, require_providers, voyage_embeddings
from repository_index import (
    MAX_ARCHIVE_FILES, MAX_FILE_BYTES, MAX_SOURCE_CHUNKS, Evidence, chunks_for_document,
    eligible_repository_file, file_priority, rank_evidence, sliding_code_windows, swe_qa_windows,
)

PATH_REFERENCE = re.compile(r"(?<![\w/])(?:[\w.-]+/)*[\w.-]+\.[A-Za-z][\w]*")


def load_documents(root, scope):
    documents = []
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if (path.is_symlink() or not path.is_file()
                or not eligible_repository_file(relative.as_posix())
                or path.stat().st_size == 0
                or (scope != "full" and path.stat().st_size > MAX_FILE_BYTES)):
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        name = relative.as_posix()
        kind = "code" if file_priority(name)[0] == 2 else "doc"
        documents.append(Evidence(kind, name, name, content))
    documents.sort(key=lambda item: file_priority(item.title))
    if scope == "production":
        docs = [item for item in documents if item.kind == "doc"][:16]
        code = [item for item in documents if item.kind == "code"][:16]
        return docs + code
    return documents[:MAX_ARCHIVE_FILES] if scope == "archive" else documents


def known_files(answer, documents):
    # Reference prose is used only for scoring. Paths alone do not establish
    # that the specific supporting lines were retrieved.
    paths = {item.title for item in documents}
    return {match[0] for match in PATH_REFERENCE.finditer(answer) if match[0] in paths}


def as_windows(documents, window, scope):
    if window == "paper":
        return [chunk for item in documents for chunk in swe_qa_windows(item)]
    chunks = []
    for item in documents:
        if window == "production" and item.kind == "code":
            chunks.extend(sliding_code_windows(item))
        else:
            chunks.extend(chunks_for_document(item, limit=3))
    return chunks[:MAX_SOURCE_CHUNKS] if scope != "full" else chunks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True, help="One official SWE-QA JSONL file.")
    parser.add_argument("--repo", type=Path, required=True, help="Source tree at the official benchmark commit.")
    parser.add_argument("--revision", required=True, help="Commit SHA recorded in the report.")
    parser.add_argument("--window", choices=("paper", "production", "legacy"), default="paper")
    parser.add_argument("--scope", choices=("full", "production", "archive"), default="full")
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--limit", type=int)
    ranking = parser.add_mutually_exclusive_group()
    ranking.add_argument("--embeddings", action="store_true", help="Use ReszVault's local embedding model.")
    ranking.add_argument("--voyage", action="store_true", help="Use SWE-QA Voyage code embeddings and inner-product ranking.")
    parser.add_argument("--paper-answer", action="store_true", help="Use the SWE-QA answer prompt and configured paper model.")
    parser.add_argument("--candidates", type=Path, help="Optional candidate JSONL for the official judge. Uses GROQ_API_KEY.")
    args = parser.parse_args()
    if not args.repo.is_dir() or args.top_k < 1 or (args.limit is not None and args.limit < 1):
        parser.error("Provide a source directory and positive retrieval limits.")
    if args.paper_answer and (not args.candidates or not args.voyage or args.window != "paper"):
        parser.error("--paper-answer requires --candidates, --voyage, and --window paper.")
    if args.voyage:
        try:
            require_providers(answer=args.paper_answer)
        except RuntimeError as error:
            parser.error(str(error))
    if args.candidates and not args.paper_answer and not os.getenv("GROQ_API_KEY"):
        parser.error("--candidates requires GROQ_API_KEY unless --paper-answer is set.")
    if args.candidates and args.candidates.resolve() == args.dataset.resolve():
        parser.error("Write candidate answers to a separate file.")
    if (args.repo / ".git").exists():
        revision = subprocess.check_output(["git", "-C", str(args.repo), "rev-parse", "HEAD"], text=True).strip()
        if not revision.startswith(args.revision):
            parser.error(f"Checked-out revision {revision} does not match --revision.")
    questions = [json.loads(line) for line in args.dataset.read_text().splitlines() if line.strip()][:args.limit]
    documents = load_documents(args.repo, args.scope)
    paper_documents = [item for item in documents if item.kind == "code"] if args.voyage else documents
    windows = as_windows(paper_documents, args.window, args.scope)
    if not windows or not questions:
        parser.error("The source tree or benchmark file has no usable records.")
    # Label against the entire eligible tree, including files that production omitted.
    label_documents = documents if args.scope == "full" else load_documents(args.repo, "full")
    vectors = None
    if args.voyage:
        vectors = voyage_embeddings([item.text for item in windows], "document")
    elif args.embeddings:
        vectors = embed_texts([f"{item.title}\n{item.text}" for item in windows])
    candidates = []
    found = labelled = 0
    recall = reciprocal_rank = 0.0
    for item in questions:
        question = item["question"]
        if args.voyage:
            query_vector = voyage_embeddings([question], "query")[0]
            retrieved = dense_top_k(windows, vectors, query_vector, args.top_k)
        else:
            retrieved = rank_evidence(question, windows, vectors=vectors, top_k=args.top_k)
        expected = known_files(item["answer"], label_documents)
        if expected:
            labelled += 1
            matches = [rank for rank, result in enumerate(retrieved, 1) if result.title in expected]
            if matches:
                found += 1
                reciprocal_rank += 1 / matches[0]
            recall += len(expected & {result.title for result in retrieved}) / len(expected)
        if args.candidates:
            sources = evidence_payload(retrieved, full_windows=args.paper_answer)
            answer = None
            if sources:
                answer = (baseline_answer(question, sources) if args.paper_answer else
                          groq_complete(repository_answer_prompt(args.dataset.stem, question, sources)))
            candidates.append({"question": question, "answer": answer or "No supported answer was produced."})
    if args.candidates:
        args.candidates.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in candidates))
    print(json.dumps({
        "dataset": args.dataset.stem, "revision": args.revision, "window": args.window,
        "scope": args.scope, "retrieval": "voyage" if args.voyage else ("hybrid" if args.embeddings else "keyword"),
        "top_k": args.top_k, "questions": len(questions), "file_labelled_questions": labelled,
        "indexed_files": len(paper_documents), "indexed_windows": len(windows),
        "file_hit_at_k": found / labelled if labelled else None,
        "file_recall_at_k": recall / labelled if labelled else None,
        "file_mrr_at_k": reciprocal_rank / labelled if labelled else None,
    }, indent=2))


if __name__ == "__main__":
    main()
