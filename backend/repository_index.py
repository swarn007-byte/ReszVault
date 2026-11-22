"""Repository ingestion, snapshot storage, and evidence retrieval."""

import base64
import gzip
import io
import json
import logging
import re
import tarfile
import time
from collections import Counter
from dataclasses import asdict, dataclass, replace
from pathlib import PurePosixPath
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

import numpy as np
from fastapi import HTTPException
from rank_bm25 import BM25Okapi

from rag import embed_texts, tokenize_text
from storage import db, env_bool

logger = logging.getLogger(__name__)
INDEX_TTL = 6 * 60 * 60
JOB_LEASE = 10 * 60
MAX_CHUNKS = 1100
RETRIEVAL_TOP_K = 10
CODE_WINDOW_LINES = 120
CODE_WINDOW_OVERLAP = 24
MAX_SOURCE_CHUNKS = 650
MAX_ARCHIVE_FILES = 250
MAX_FILE_BYTES = 48_000
FILE_SUFFIXES = {
    ".md", ".rst", ".adoc", ".txt", ".py", ".go", ".rs", ".js", ".ts", ".tsx", ".jsx",
    ".java", ".kt", ".rb", ".c", ".h", ".cpp", ".cs", ".swift", ".vue", ".svelte",
}
EXCLUDED_DIRS = {".git", "vendor", "node_modules", "dist", "build", "coverage", "fixtures"}
QUERY_STOP_WORDS = set(
    "a an and are about as at be by can could did do does for from had has have how i in is it "
    "me of on or please repo repository should tell than that the their this to was were what when "
    "where which who why will with would you".split()
)


@dataclass(frozen=True)
class Evidence:
    kind: str
    title: str
    url: str
    text: str
    number: int | None = None


def index_key(repo):
    visibility = "private" if repo["private"] else "public"
    return f"{repo['id']}:{visibility}"


def index_status(repo_id):
    with db() as conn:
        row = conn.execute(
            "SELECT synced_at, lease_until, stale, error, chunk_count FROM repository_indexes WHERE repo_id = ?",
            (repo_id,),
        ).fetchone()
    if row is None:
        return {"state": "missing", "sourceCount": 0, "syncedAt": None}
    state = "syncing" if row["lease_until"] > time.time() else "ready"
    if state == "ready" and row["error"]:
        state = "failed"
    elif state == "ready" and not row["synced_at"]:
        state = "missing"
    elif state == "ready" and (row["stale"] or row["synced_at"] < time.time() - INDEX_TTL):
        state = "stale"
    return {"state": state, "sourceCount": row["chunk_count"], "syncedAt": row["synced_at"]}


def mark_stale(repo_id):
    with db() as conn:
        conn.execute("UPDATE repository_indexes SET stale = stale + 1 WHERE repo_id IN (?, ?)",
                     (f"{repo_id}:public", f"{repo_id}:private"))


def claim_sync(repo_id, force=False):
    now = int(time.time())
    lease = uuid4().hex
    with db() as conn:
        conn.execute("INSERT INTO repository_indexes (repo_id) VALUES (?) ON CONFLICT DO NOTHING", (repo_id,))
        row = conn.execute(
            """UPDATE repository_indexes SET lease = ?, lease_until = ?, error = 0
               WHERE repo_id = ? AND lease_until <= ?
                 AND (? OR synced_at IS NULL OR stale > 0 OR synced_at < ?)
               RETURNING stale""",
            (lease, now + JOB_LEASE, repo_id, now, force, now - INDEX_TTL),
        ).fetchone()
    return (lease, row["stale"]) if row else None


def sliding_code_windows(evidence, *, lines_per_window=CODE_WINDOW_LINES,
                         overlap=CODE_WINDOW_OVERLAP, char_budget=4000):
    lines = evidence.text.splitlines()
    start = 0
    while start < len(lines):
        end = min(start + lines_per_window, len(lines))
        if char_budget:
            used = len(lines[start])
            end = start + 1
            while (end < min(start + lines_per_window, len(lines))
                   and used + len(lines[end]) + 1 <= char_budget):
                used += len(lines[end]) + 1
                end += 1
        text = "\n".join(lines[start:end]).strip()
        if char_budget:
            text = text[:char_budget]
        if text:
            yield replace(evidence, text=text, url=f"{evidence.url}#L{start + 1}-L{end}")
        if end == len(lines):
            break
        # Keep moving even if unusually long lines make the window shorter than the overlap.
        start = end - min(overlap, (end - start) // 3)


def chunks_for_document(evidence, limit=5):
    lines = evidence.text.splitlines()
    for start in range(0, min(len(lines), 60 * limit), 60):
        text = "\n".join(lines[start:start + 65]).strip()[:2400]
        if not text:
            continue
        url = evidence.url
        if evidence.kind == "doc":
            url += f"#L{start + 1}-L{min(start + 65, len(lines))}"
        yield replace(evidence, text=text, url=url)


def record_evidence(item):
    is_pr = bool(item.get("pull_request"))
    kind = "PR" if is_pr else "issue"
    state = item["state"]
    if is_pr and item["pull_request"].get("merged_at"):
        state = "merged"
    date = (item.get("updated_at") or "")[:10]
    body = item.get("body") or ""
    return Evidence(kind, item["title"], item["html_url"], f"State: {state}. Updated: {date}.\n{body}", item["number"])


def comment_evidence(item, kind):
    url = item.get("html_url", "")
    match = re.search(r"/(?:issues|pull)/(\d+)", url)
    if not match or not item.get("body"):
        return None
    number = int(match[1])
    path = item.get("path", "")
    author = (item.get("user") or {}).get("login", "")
    return Evidence(kind, f"{kind} on #{number}", url, f"{author} {path}\n{item['body']}", number)


def github_page(get, path, count, **params):
    for page in range(1, count + 1):
        items = get(f"{path}?{urlencode({**params, 'per_page': 100, 'page': page})}")
        yield from items
        if len(items) < 100:
            break


def file_priority(path):
    name = PurePosixPath(path).name.lower()
    if name.startswith(("readme", "contributing", "architecture", "changelog")):
        return (0, path.count("/"), path)
    if PurePosixPath(path).suffix.lower() in {".md", ".rst", ".adoc"}:
        return (1, path.count("/"), path)
    return (2, path.count("/"), path)


def eligible_repository_file(path):
    file = PurePosixPath(path)
    return (
        not any(part.startswith(".") or part in EXCLUDED_DIRS for part in path.split("/"))
        and (file.suffix.lower() in FILE_SUFFIXES or file.name.lower() in {"readme", "contributing", "license"})
    )


def archive_documents(repo):
    owner, name = (quote(part, safe="") for part in repo["full_name"].split("/"))
    commit = quote(repo["ref"], safe="")
    request = Request(f"https://codeload.github.com/{owner}/{name}/tar.gz/{commit}",
                      headers={"User-Agent": "ReszVault"})
    compressed_limit = 12_000_000
    expanded_limit = 48_000_000
    with urlopen(request, timeout=15) as response:
        compressed = response.read(compressed_limit + 1)
    if len(compressed) > compressed_limit:
        raise ValueError("Repository archive exceeds download budget.")
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as archive:
        content = archive.read(expanded_limit + 1)
    if len(content) > expanded_limit:
        raise ValueError("Repository archive exceeds expansion budget.")
    with tarfile.open(fileobj=io.BytesIO(content), mode="r:") as archive:
        files = {}
        for member in archive:
            _, _, path = member.name.partition("/")
            if (member.isfile() and 0 < member.size <= MAX_FILE_BYTES and path
                    and eligible_repository_file(path)):
                files[path] = member
        result = []
        for path in sorted(files, key=file_priority)[:MAX_ARCHIVE_FILES]:
            with archive.extractfile(files[path]) as handle:
                try:
                    source = handle.read().decode("utf-8")
                except UnicodeDecodeError:
                    continue
            kind = "doc" if file_priority(path)[0] < 2 else "code"
            result.append(Evidence(kind, path, f"{repo['html_url']}/blob/{commit}/{quote(path)}", source))
        return result


def repository_documents(get, repo):
    base = f"/repos/{repo['full_name']}"
    commit = quote(repo["ref"], safe="")
    tree = get(f"{base}/git/trees/{commit}?recursive=1")
    files = [
        item for item in tree.get("tree", [])
        if item["type"] == "blob" and 0 < item.get("size", 0) <= MAX_FILE_BYTES
        and item.get("mode") != "120000" and eligible_repository_file(item["path"])
    ]
    paths = sorted(files, key=lambda item: file_priority(item["path"]))
    # Reserve room for both documentation and code in repos with many docs.
    selected = [item for item in paths if file_priority(item["path"])[0] < 2][:16]
    selected += [item for item in paths if file_priority(item["path"])[0] == 2][:16]
    for item in selected:
        path = item["path"]
        # Load the blob and cite the commit that was captured for this snapshot.
        blob = get(f"{base}/git/blobs/{item['sha']}")
        if blob.get("encoding") != "base64":
            continue
        try:
            text = base64.b64decode(blob["content"]).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            continue
        kind = "doc" if file_priority(path)[0] < 2 else "code"
        yield Evidence(kind, path, f"{repo['html_url']}/blob/{commit}/{quote(path)}", text)


DISCUSSIONS_QUERY = """
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    discussions(first: 12, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        title url body
        comments(first: 8) { nodes { url body } }
      }
    }
  }
}
"""


def github_discussions(graphql, repo):
    if not repo.get("has_discussions"):
        return
    owner, name = repo["full_name"].split("/")
    try:
        result = graphql(DISCUSSIONS_QUERY, {"owner": owner, "name": name})
    except HTTPException as error:
        if error.status_code in {403, 404}:
            return
        raise
    repository = (result.get("data") or {}).get("repository") or {}
    for item in (repository.get("discussions") or {}).get("nodes", []):
        yield Evidence("GitHub Discussion", item["title"], item["url"], item["body"])
        for comment in item["comments"]["nodes"]:
            yield Evidence("discussion comment", item["title"], comment["url"], comment["body"])


def collect_repository(get, get_files, graphql, repo):
    base = f"/repos/{repo['full_name']}"
    if repo.get("readable_ref"):
        source_repo = {**repo, "ref": repo["readable_ref"]}
        documents = []
        # Public archives cover more paths with one request. Private data still
        # comes from the existing authenticated GitHub API.
        if not repo["private"] and repo.get("archive_url"):
            try:
                documents = archive_documents(source_repo)
            except (OSError, EOFError, tarfile.TarError, ValueError):
                logger.info("Repository archive unavailable; using the bounded blob index.")
        yield from documents or repository_documents(get_files, source_repo)
    records = list(github_page(get, f"{base}/issues", 3, state="all", sort="updated", direction="desc"))
    for item in records:
        yield record_evidence(item)
    for endpoint, kind in (("issues/comments", "discussion"), ("pulls/comments", "review comment")):
        for item in github_page(get, f"{base}/{endpoint}", 1, sort="updated", direction="desc"):
            evidence = comment_evidence(item, kind)
            if evidence:
                yield evidence
    yield from github_discussions(graphql, repo)
    prs = [item for item in records if item.get("pull_request")]
    for item in prs[:8]:
        number = item["number"]
        for review in get(f"{base}/pulls/{number}/reviews?per_page=20"):
            if review.get("body"):
                yield Evidence("review", f"Review of #{number}: {item['title']}", review["html_url"], review["body"], number)
        for file in get(f"{base}/pulls/{number}/files?per_page=12"):
            if file.get("patch"):
                yield Evidence("diff", f"#{number} · {file['filename']}", f"{item['html_url']}/files",
                               file["patch"], number)


def synchronize_repository(request_github, token, repo, claim):
    lease, revision = claim
    repo_id = index_key(repo)
    try:
        all_chunks = []
        def graphql(query, variables):
            return request_github("/graphql", token, json_payload={"query": query, "variables": variables})

        files_token = None if repo.get("public_files") else token
        for evidence in collect_repository(
            lambda path: request_github(path, token),
            lambda path: request_github(path, files_token),
            graphql,
            repo,
        ):
            if evidence.kind in {"code", "doc"}:
                remaining = MAX_SOURCE_CHUNKS - len(all_chunks)
                if remaining <= 0:
                    continue
                windows = sliding_code_windows(evidence) if evidence.kind == "code" else chunks_for_document(evidence, limit=3)
                all_chunks.extend(chunk for _, chunk in zip(range(remaining), windows))
            else:
                all_chunks.extend(chunks_for_document(evidence, limit=3))
            if len(all_chunks) >= MAX_CHUNKS:
                all_chunks = all_chunks[:MAX_CHUNKS]
                break
        vectors = None
        if all_chunks and env_bool("REPOSITORY_LOCAL_EMBEDDINGS"):
            try:
                vectors = embed_texts([f"{item.title}\n{item.text}" for item in all_chunks])
            except Exception:
                logger.warning("Repository embeddings unavailable; retaining keyword retrieval.")
        payload = json.dumps([asdict(item) for item in all_chunks], ensure_ascii=False)
        with db() as conn:
            conn.execute(
                """UPDATE repository_indexes SET chunks = ?, vectors = ?, synced_at = ?, chunk_count = ?,
                   stale = MAX(0, stale - ?), lease = NULL, lease_until = 0, error = 0
                   WHERE repo_id = ? AND lease = ?""",
                (payload, vectors.tobytes() if vectors is not None else None, int(time.time()),
                 len(all_chunks), revision, repo_id, lease),
            )
    except Exception as error:
        logger.warning("Repository index sync failed for %s (%s)", repo_id, type(error).__name__)
        with db() as conn:
            conn.execute(
                "UPDATE repository_indexes SET lease = NULL, lease_until = 0, error = 1 WHERE repo_id = ? AND lease = ?",
                (repo_id, lease),
            )


def terms(text):
    return [term for term in tokenize_text(text) if term not in QUERY_STOP_WORDS]


def references(question):
    return {int(number) for number in re.findall(r"(?:#|\b(?:pr|pull request|issue)\s+)(\d{1,10})\b", question, re.I)}


def live_evidence(get, repo, question):
    base = f"/repos/{repo['full_name']}"
    numbers = sorted(references(question))
    if numbers:
        for number in numbers[:3]:
            try:
                item = get(f"{base}/issues/{number}")
            except HTTPException as error:
                if error.status_code == 404:
                    continue
                raise
            yield record_evidence(item)
            if item.get("pull_request"):
                for comment in get(f"{base}/pulls/{number}/comments?per_page=15"):
                    evidence = comment_evidence(comment, "review comment")
                    if evidence:
                        yield evidence
            for comment in get(f"{base}/issues/{number}/comments?per_page=15"):
                evidence = comment_evidence(comment, "discussion")
                if evidence:
                    yield evidence
        return
    query = [term for term in terms(question) if term not in
             {"pr", "prs", "pull", "request", "requests", "issue", "issues", "recent", "latest", "list"}]
    if not query:
        if re.search(r"\b(issues?|prs?|pull requests?)\b", question, re.I):
            only_prs = bool(re.search(r"\b(prs?|pull requests?)\b", question, re.I))
            state = next((value for value in ("open", "closed") if re.search(rf"\b{value}\b", question, re.I)), "all")
            for item in get(f"{base}/issues?state={state}&per_page=25"):
                if bool(item.get("pull_request")) == only_prs:
                    yield record_evidence(item)
        return
    search = " ".join(query[:3]) + f" repo:{repo['full_name']}"
    try:
        response = get(f"/search/issues?{urlencode({'q': search, 'per_page': 8})}")
    except HTTPException as error:
        if error.status_code in {403, 422, 429, 502}:
            return
        raise
    for item in response["items"]:
        if item.get("repository_url") == f"https://api.github.com{base}":
            yield record_evidence(item)


def load_snapshot(repo_id):
    with db() as conn:
        row = conn.execute("SELECT chunks, vectors FROM repository_indexes WHERE repo_id = ?", (repo_id,)).fetchone()
    evidence = [Evidence(**item) for item in json.loads(row["chunks"])] if row and row["chunks"] else []
    return evidence, row["vectors"] if row else None


def repository_intent(question):
    text = " ".join(tokenize_text(question))
    if re.fullmatch(r"(?:please )?(?:summari[sz]e|summary|overview)(?: (?:this |the )?(?:repo(?:sitory)?|project|codebase|it))?(?: please)?", text):
        return "overview"
    if re.fullmatch(r"(?:give me )?(?:a |an )?(?:summary|overview)(?: of (?:this |the )?(?:repo(?:sitory)?|project|codebase))?", text):
        return "overview"
    if re.fullmatch(r"(?:what (?:is|does) (?:this |the )?(?:repo(?:sitory)?|project|codebase)(?: about| do)?|what is this)", text):
        return "overview"
    if re.search(r"(?:what|which).{0,40}(?:access to|(?:sources|files|data|content).{0,20}(?:access|see|index)|(?:is|have you|did you) indexed)|^(?:list|show)(?: me)? (?:the |your |indexed )?(?:sources|indexed content)\b", text):
        return "inventory"
    return None


def inventory(evidence):
    groups = (
        ("Documentation", {"doc"}),
        ("Source files", {"code"}),
        ("Pull requests and patches", {"PR", "diff"}),
        ("Issues", {"issue"}),
        ("Comments, reviews and discussions", {"discussion", "review", "review comment", "GitHub Discussion", "discussion comment"}),
    )
    lines = []
    for label, kinds in groups:
        unique_items = {item.url.split("#L", 1)[0] for item in evidence if item.kind in kinds}
        if unique_items:
            lines.append(f"- {label}: {len(unique_items)}")
    return lines


def readme_excerpt(evidence):
    for item in evidence:
        if item.kind != "doc" or not PurePosixPath(item.title).name.lower().startswith("readme"):
            continue
        paragraphs = []
        for block in re.split(r"\n\s*\n", item.text):
            lines = block.strip().splitlines()
            if not lines or lines[0].lstrip().startswith(("#", ">", "!", "[", "<", "```", "-", "|")):
                continue
            paragraph = " ".join(line.strip() for line in lines)
            if len(paragraph) > 100 or re.match(r"\w.+[.!?]$", paragraph):
                paragraphs.append(paragraph)
            if len(paragraphs) == 2:
                break
        if paragraphs:
            excerpt = "\n\n".join(paragraphs)
            if len(excerpt) > 650:
                excerpt = excerpt[:650].rsplit(" ", 1)[0] + "…"
            return item, excerpt
    return None, ""


def retrieve(repo_id, question, live, include_files=True):
    indexed, embeddings = load_snapshot(repo_id)
    vectors = None
    if embeddings and indexed and env_bool("REPOSITORY_LOCAL_EMBEDDINGS"):
        vectors = np.frombuffer(embeddings, dtype=np.float32).reshape((len(indexed), -1))
    return rank_evidence(question, indexed, live, include_files=include_files, vectors=vectors)


def rank_evidence(question, indexed, live=(), *, include_files=True, vectors=None, top_k=RETRIEVAL_TOP_K):
    candidates = [*live, *indexed]
    if not candidates:
        return []
    query = terms(question)
    exact = references(question)
    tokens = [terms(f"{item.kind} {item.title} {item.title} {item.text}") for item in candidates]
    keyword = BM25Okapi(tokens).get_scores(query) if any(tokens) and query else np.zeros(len(candidates))
    semantic = np.zeros(len(candidates))
    if vectors is not None and indexed and query:
        try:
            semantic[len(live):] = np.maximum(0, vectors @ embed_texts([question])[0] - 0.20)
        except Exception:
            logger.warning("Repository vector search unavailable; using keywords.")
    query_terms = set(query)
    scored = []
    for i, item in enumerate(candidates):
        if not include_files and item.kind in {"doc", "code"}:
            continue
        if exact and item.number not in exact:
            continue
        overlap = len(query_terms.intersection(tokens[i]))
        score = (2 * bool(item.number in exact) + 0.5 * overlap
                 + max(0, float(keyword[i])) * 0.2 + 5 * float(semantic[i]))
        if score > 0 or i < len(live):
            scored.append((score, i))
    result = []
    seen = set()
    by_document = Counter()
    for _, i in sorted(scored, key=lambda entry: (-entry[0], entry[1])):
        item = candidates[i]
        document = item.url.split("#L", 1)[0]
        if item.url in seen or by_document[document] == 2:
            continue
        seen.add(item.url)
        by_document[document] += 1
        result.append(item)
        if len(result) == top_k:
            break
    return result
