"""Direct, source-backed views for repository navigation questions."""

import base64
import re
from pathlib import PurePosixPath
from urllib.parse import quote, urlencode

from fastapi import HTTPException

FILE_REQUEST = re.compile(
    r"^(?:(?:please\s+)?(?:give(?: me)?|show(?: me)?|open|read|display)(?:\s+the)?\s+)?"
    r"`?((?:[\w.-]+/)*(?:[\w.-]+\.[A-Za-z][\w.-]*|readme))`?(?:\s+please)?[?!]*$",
    re.I,
)
LANGUAGES = {
    ".go": "go", ".py": "python", ".ts": "typescript", ".tsx": "tsx", ".js": "javascript",
    ".jsx": "jsx", ".md": "markdown", ".json": "json", ".sql": "sql", ".sh": "bash",
    ".yaml": "yaml", ".yml": "yaml", ".toml": "toml", ".rs": "rust",
}


def markdown_text(value):
    return re.sub(r"([\\`*_{}\[\]<>()#+.!|~-])", r"\\\1", value)


def code_block(text, language="text"):
    longest = max((len(run) for run in re.findall(r"`+", text)), default=0)
    fence = "`" * max(3, longest + 1)
    return f"{fence}{language}\n{text}\n{fence}"


def requested_file(question):
    match = FILE_REQUEST.fullmatch(question)
    if match and not {".", ".."}.intersection(match[1].split("/")):
        return match[1]
    return None


def fetch_optional(get, path):
    try:
        return get(path)
    except HTTPException as error:
        if error.status_code != 404:
            raise
        return None


def read_text(item):
    if not isinstance(item, dict) or item.get("type") != "file" or item.get("encoding") != "base64":
        return None
    try:
        content = base64.b64decode(item.get("content", "")).decode("utf-8")
    except (ValueError, UnicodeError):
        return None
    return None if "\0" in content else content


def missing_ref():
    return {"answer": "I couldn’t read the default branch. Check repository Contents access and try again.", "sources": []}


def repository_folders(get, repo, *, details=False):
    ref = repo["readable_ref"]
    if not ref:
        return missing_ref()
    commit = quote(ref, safe="")
    path = f"/repos/{repo['full_name']}/git/trees/{commit}"
    tree = get(f"{path}?recursive=1" if details else path)
    entries = tree["tree"]
    roots = sorted(item["path"] for item in entries if item["type"] == "tree" and "/" not in item["path"])
    lines = []
    for folder in roots[:40]:
        label = f"**{markdown_text(folder)}/**"
        if details:
            children = sorted(
                (item for item in entries if item["path"].rpartition("/")[0] == folder),
                key=lambda item: (item["type"] != "tree", item["path"]),
            )
            examples = [markdown_text(item["path"].split("/")[-1]) + ("/" if item["type"] == "tree" else "")
                        for item in children[:8]]
            if examples:
                label += f" — {', '.join(examples)}"
                if len(children) > len(examples):
                    label += f" (and {len(children) - len(examples)} more)"
        lines.append(f"- {label}")
    answer = f"Top-level folders in **{repo['full_name']}**:"
    if lines:
        answer += "\n\n" + "\n".join(lines)
    else:
        answer = "GitHub returned no top-level folders on the default branch."
    if len(roots) > 40 or tree.get("truncated"):
        answer += "\n\nGitHub returned a partial list. Open the tree for more."
    return {"answer": answer, "sources": [
        {"id": 1, "title": "Repository tree", "url": f"{repo['html_url']}/tree/{commit}", "kind": "tree"},
    ]}


def repository_file(get, repo, path):
    ref = repo["readable_ref"]
    if not ref:
        return missing_ref()
    commit = quote(ref, safe="")
    base = f"/repos/{repo['full_name']}"
    ref_query = urlencode({"ref": ref})
    if "/" not in path and path.lower() in {"readme", "readme.md"}:
        item = fetch_optional(get, f"{base}/readme?{ref_query}")
    else:
        item = fetch_optional(get, f"{base}/contents/{quote(path)}?{ref_query}")
    if item is None and "/" not in path:
        tree = get(f"{base}/git/trees/{commit}?recursive=1")
        matches = sorted(node["path"] for node in tree["tree"] if node["type"] == "blob"
                         and PurePosixPath(node["path"]).name.lower() == path.lower())
        if len(matches) > 1:
            choices = "\n".join(f"- {markdown_text(match)}" for match in matches[:12])
            return {"answer": f"I found multiple files named **{markdown_text(path)}**. Ask for the full path:\n\n{choices}", "sources": []}
        if matches:
            item = fetch_optional(get, f"{base}/contents/{quote(matches[0])}?{ref_query}")
    if item is None:
        return {"answer": f"I couldn’t find **{markdown_text(path)}** on the default branch.", "sources": []}
    if not isinstance(item, dict) or item.get("type") != "file":
        return {"answer": f"**{markdown_text(path)}** is a folder or a reference to another repository. Ask for a file path.", "sources": []}
    path = item["path"]
    url = f"{repo['html_url']}/blob/{commit}/{quote(path)}"
    text = read_text(item)
    if text is None:
        answer = f"**{markdown_text(path)}** is available on GitHub. Its contents aren’t available as a text preview."
    else:
        lines = text.splitlines()
        preview = "\n".join(lines[:200])
        shown = len(lines) > 200 or len(preview) > 12_000
        if len(preview) > 12_000:
            preview = preview[:12_000].rsplit("\n", 1)[0] or preview[:12_000]
        language = LANGUAGES.get(PurePosixPath(path).suffix.lower(), "text")
        label = "preview" if shown else "full file"
        answer = f"**{markdown_text(path)}** ({label})\n\n{code_block(preview, language)}"
        if shown:
            answer += "\n\nOpen the GitHub source for the rest of the file."
    return {"answer": answer, "sources": [{"id": 1, "title": path, "url": url, "kind": "file"}]}


HEADINGS = re.compile(r"(?m)^(#{1,6})[ \t]+([^\n]+)$")
FLOW_HEADINGS = re.compile(r"\b(?:architecture|workflow|pipeline|data flow|request flow|processing flow|how it works|lifecycle)\b", re.I)


def flow_section(text):
    # Ignore heading-looking lines inside fenced examples.
    masked = re.sub(r"(?ms)^`{3,}[^\n]*\n.*?^`{3,}[^\n]*$", lambda m: re.sub(r"[^\n]", " ", m[0]), text)
    headings = list(HEADINGS.finditer(masked))
    for i, heading in enumerate(headings):
        if FLOW_HEADINGS.search(heading[2]):
            end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
            section = text[heading.end():end].strip()
            if section:
                return heading[2].rstrip(" #"), section, text.count("\n", 0, heading.start()) + 1
    return None


def repository_pipeline(get, repo):
    ref = repo["readable_ref"]
    if not ref:
        return missing_ref()
    commit = quote(ref, safe="")
    base = f"/repos/{repo['full_name']}"
    ref_query = urlencode({"ref": ref})
    endpoints = [f"{base}/readme?{ref_query}"] + [
        f"{base}/contents/{path}?{ref_query}" for path in ("ARCHITECTURE.md", "docs/architecture.md", "docs/ARCHITECTURE.md")
    ]
    for i, endpoint in enumerate(endpoints):
        item = fetch_optional(get, endpoint)
        text = read_text(item)
        if not text:
            continue
        section = flow_section(text)
        if not section and i > 0:
            section = ("Architecture", text, 1)
        if not section:
            continue
        heading, excerpt, line = section
        # Preserve the layout of diagrams while keeping other text non-executable.
        diagram = re.fullmatch(r"`{3,}(?:text|plaintext|ascii)?\s*\n([\s\S]*?)\n`{3,}", excerpt, re.I)
        shown = (diagram[1] if diagram else excerpt)[:4500]
        answer = (f"**{repo['full_name']} — {markdown_text(heading)}**\n\n"
                  f"{code_block(shown)}")
        if len(diagram[1] if diagram else excerpt) > len(shown):
            answer += "\n\nOpen the architecture source for the full section."
        url = f"{repo['html_url']}/blob/{commit}/{quote(item['path'])}#L{line}"
        return {"answer": answer, "sources": [
            {"id": 1, "title": item["path"], "url": url, "kind": "doc"},
        ]}
    return {"answer": "I couldn’t find a documented pipeline or architecture section in the README or standard architecture files.", "sources": []}
