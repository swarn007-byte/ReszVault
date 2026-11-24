import os
from typing import Annotated

from asgiref.sync import sync_to_async
from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections
from django.utils import timezone
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field

from rag import retrieve_across_books
from vaults.models import AppSession
from vaults.pdf_views import book_contexts, find_books

server = FastMCP("ReszVault")


@sync_to_async
def search_owned_books(question, book_ids):
    close_old_connections()
    try:
        token = os.getenv("RESZVAULT_MCP_SESSION_TOKEN")
        session = AppSession.objects.filter(token=token, expires_at__gt=timezone.now()).first()
        if not session:
            raise ToolError("A live ReszVault session is required.")
        books = find_books(f"user:{session.user_id}", book_ids).filter(status="ready").prefetch_related("chunks")
        return [
            {"title": title, "page": chunk.page, "text": chunk.text}
            for _, title, chunk in retrieve_across_books(question, book_contexts(books))
        ]
    finally:
        close_old_connections()


@server.tool(annotations=ToolAnnotations(readOnlyHint=True))
async def search_vault_sources(
    question: Annotated[str, Field(min_length=1, max_length=4000)],
    book_ids: Annotated[list[str] | None, Field(max_length=250)] = None,
) -> list[dict[str, str | int]]:
    """Search indexed PDF passages owned by the configured session. Optionally restrict the search to book IDs."""
    if not question.strip():
        raise ToolError("Question cannot be blank.")
    return await search_owned_books(question, book_ids)


class Command(BaseCommand):
    help = "Run the authenticated ReszVault MCP search tool over stdio."

    def handle(self, *args, **options):
        if not os.getenv("RESZVAULT_MCP_SESSION_TOKEN"):
            raise CommandError("Set RESZVAULT_MCP_SESSION_TOKEN before running the tool.")
        server.run(transport="stdio")
