"""Compare evidence from PDFs already scoped to the current vault."""

import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from document_parser import Chunk
from rag import (
    MISSING_REPLY, QUERY_STOP_WORDS, BookContext, answer_question, build_prompt,
    groq_complete, retrieve_by_book, tokenize_text, wants_full_list, wants_project_summary,
    wants_source_inventory,
)

DURATION = re.compile(r"(?<![\d.])\b(\d{1,5})\s*(?:(business|working|calendar)\s+)?(hours?|days?|weeks?|months?)\b", re.I)
EFFECTIVE = re.compile(r"\b(?:effective(?:\s+(?:date|on|from))?|valid\s+from)\s*:?\s*(\d{4}-\d{2}-\d{2})\b", re.I)
SCOPE = re.compile(r"\b(?:scope\s*:|applies\s+to\s*:?)\s*([^\n.!?;]{1,100})", re.I)
AS_OF = re.compile(r"\bas\s+of\s+(\d{4}-\d{2}-\d{2})\b", re.I)
CURRENT = re.compile(r"\b(?:current|latest|today)\b", re.I)
COMPARISON_REQUEST = re.compile(r"\b(?:compare|conflict(?:ing)?|differ(?:ent|ences)?|versus|vs)\b", re.I)
EXPIRY = re.compile(r"\b(?:expir(?:es|y|ation)|valid through|valid until)\b", re.I)
DURATION_TERMS = frozenset(
    "hour hours day days week weeks month months business calendar working current latest today "
    "compare versus vs policy policies different difference differences as".split()
)
MAX_EVIDENCE = 6


@dataclass(frozen=True)
class Passage:
    book: BookContext
    chunk: Chunk


@dataclass(frozen=True)
class Claim:
    passage: Passage
    sentence: str
    duration: tuple[str, int]


@dataclass(frozen=True)
class PolicyContext:
    scope: tuple[str, Passage] | None
    effective: tuple[date, Passage] | None


class ComparisonState(TypedDict, total=False):
    question: str
    books: list[BookContext]
    use_hybrid: bool
    evidence: list[Passage]
    claims: list[Claim]
    resolution: str
    selected_claim: Claim
    context_refs: list[tuple[Passage, str]]
    answer: str
    sources_used: int


def normalized_duration(match):
    number, convention, unit = match.groups()
    amount = int(number)
    unit = unit.lower().rstrip("s")
    business = (convention or "").lower() in {"business", "working"}
    if business:
        return (f"business_{unit}", amount)
    if unit == "month":
        return (unit, amount)
    return ("calendar_hours", amount * {"hour": 1, "day": 24, "week": 168}[unit])


def policy_terms(text):
    return {word for word in tokenize_text(text) if not word.isdigit()} - QUERY_STOP_WORDS - DURATION_TERMS


def collect_evidence(state):
    matches = retrieve_by_book(state["question"], state["books"], top_k=2, use_hybrid=state["use_hybrid"])
    # Take one hit per document before considering second hits.
    evidence = [
        Passage(book, ranked[index][1])
        for index in range(2)
        for book, ranked in matches
        if len(ranked) > index
    ]
    terms = policy_terms(state["question"])
    claims = []
    seen = set()
    for passage in evidence:
        for sentence in re.split(r"\n+|(?<=[.!?])\s+", passage.chunk.text):
            if not terms or len(terms & policy_terms(sentence)) < min(2, len(terms)):
                continue
            durations = list(DURATION.finditer(sentence))
            if len(durations) != 1:
                continue
            duration = normalized_duration(durations[0])
            key = (passage.book.id, duration)
            if key not in seen:
                seen.add(key)
                claims.append(Claim(passage, sentence.strip(), duration))
    return {"evidence": evidence, "claims": claims}


def next_step(state):
    claims = state["claims"]
    if len({claim.passage.book.id for claim in claims}) > 1 and len({claim.duration for claim in claims}) > 1:
        return "check_context"
    return "answer"


def parse_date(value):
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def read_policy_context(book):
    scopes = {}
    dates = {}
    has_expiry = any(EXPIRY.search(chunk.text) for chunk in book.chunks)
    for chunk in book.chunks:
        passage = Passage(book, chunk)
        for match in SCOPE.finditer(chunk.text):
            scope = " ".join(tokenize_text(match[1])).removesuffix(" only")
            if scope:
                scopes.setdefault(scope, passage)
        for match in EFFECTIVE.finditer(chunk.text):
            effective = parse_date(match[1])
            if effective:
                dates.setdefault(effective, passage)
    return PolicyContext(
        next(iter(scopes.items())) if len(scopes) == 1 else None,
        next(iter(dates.items())) if len(dates) == 1 and not has_expiry else None,
    )


def check_context(state):
    question = state["question"]
    claims = state["claims"]
    books = {claim.passage.book.id: claim.passage.book for claim in claims}
    policies = {book_id: read_policy_context(book) for book_id, book in books.items()}
    if not all(policy.scope for policy in policies.values()):
        return {}

    scopes = {policy.scope[0] for policy in policies.values()}
    question_text = " " + " ".join(tokenize_text(question)) + " "
    matching_scopes = {scope for scope in scopes if f" for {scope} " in question_text}
    if len(matching_scopes) == 1:
        scope = next(iter(matching_scopes))
    elif len(scopes) == 1:
        scope = next(iter(scopes))
        if re.search(r"\bfor\b", question, re.I):
            return {}
    else:
        return {}

    candidates = [claim for claim in claims if policies[claim.passage.book.id].scope[0] == scope]
    requested_date = AS_OF.search(question)
    if re.search(r"\bas\s+of\b", question, re.I) and not requested_date:
        return {}
    using_date = bool(requested_date or CURRENT.search(question))
    if using_date:
        as_of = parse_date(requested_date[1]) if requested_date else datetime.now(timezone.utc).date()
        if not as_of or not all(policies[claim.passage.book.id].effective for claim in candidates):
            return {}
        eligible = [claim for claim in candidates if policies[claim.passage.book.id].effective[0] <= as_of]
        if not eligible:
            return {}
        latest = max(policies[claim.passage.book.id].effective[0] for claim in eligible)
        candidates = [claim for claim in eligible if policies[claim.passage.book.id].effective[0] == latest]
        qualifier = f"For {scope} as of {as_of.isoformat()}"
    elif len(matching_scopes) == 1:
        qualifier = f"For {scope}"
    else:
        return {}

    if len({claim.duration for claim in candidates}) != 1:
        return {}
    selected = candidates[0]
    policy = policies[selected.passage.book.id]
    refs = [(policy.scope[1], f"Scope: {scope}.")]
    if using_date:
        effective, passage = policy.effective
        refs.append((passage, f"Effective date: {effective.isoformat()}."))
    return {
        "resolution": f"{qualifier}, **{selected.passage.book.title}** gives this rule: {selected.sentence}",
        "selected_claim": selected,
        "context_refs": refs,
    }


def citation(passage, quote):
    return f"- **{passage.book.title} (page {passage.chunk.page}):** {quote}"


def report_comparison(state):
    claims = state["claims"]
    first_claim = state.get("selected_claim", claims[0])
    # Cite a different document and duration first, then fill remaining slots.
    candidates = [
        first_claim,
        *[claim for claim in claims if claim.passage.book.id != first_claim.passage.book.id],
        *claims,
    ]
    distinct = {}
    for claim in candidates:
        distinct.setdefault(claim.duration, claim)
    displayed = list(distinct.values())[:MAX_EVIDENCE]
    lines = [citation(claim.passage, claim.sentence) for claim in displayed]
    refs = state.get("context_refs", [])
    first = state.get("resolution") or (
        "The sources give different durations. The available scope and effective-date details "
        "do not establish which rule applies. Specify the order type or an as-of date if available."
    )
    lines.extend(citation(passage, detail) for passage, detail in refs)
    source_pages = {(claim.passage.book.id, claim.passage.chunk.page) for claim in displayed}
    source_pages.update((passage.book.id, passage.chunk.page) for passage, _ in refs)
    return {"answer": first + "\n\n" + "\n".join(lines), "sources_used": len(source_pages)}


def answer_with_evidence(state):
    evidence = state["evidence"][:MAX_EVIDENCE]
    if not evidence:
        return {"answer": MISSING_REPLY, "sources_used": 0}
    excerpts = [citation(passage, " ".join(passage.chunk.text.split())[:450]) for passage in evidence]
    references = "\n".join(excerpts)
    prompt = build_prompt(state["question"], references)
    generated = groq_complete(
        prompt + "\nCite titles and page numbers. Describe disagreements and any missing "
        "applicability details explicitly."
    )
    answer = f"{generated}\n\n**Evidence**\n{references}" if generated else references
    return {"answer": answer, "sources_used": len(evidence)}


builder = StateGraph(ComparisonState)
builder.add_node("retrieve", collect_evidence)
builder.add_node("check_context", check_context)
builder.add_node("compare", report_comparison)
builder.add_node("answer", answer_with_evidence)
builder.add_edge(START, "retrieve")
builder.add_conditional_edges("retrieve", next_step, {"check_context": "check_context", "answer": "answer"})
builder.add_edge("check_context", "compare")
builder.add_edge("compare", END)
builder.add_edge("answer", END)
comparison_graph = builder.compile()


def answer_from_vault(question, books, use_hybrid=True):
    aggregate_request = wants_source_inventory(question) or wants_project_summary(question)
    if len(books) < 2 or aggregate_request or (wants_full_list(question) and not COMPARISON_REQUEST.search(question)):
        return answer_question(question, books, use_hybrid=use_hybrid)
    result = comparison_graph.invoke({"question": question, "books": books, "use_hybrid": use_hybrid})
    return result["answer"], result["sources_used"]
