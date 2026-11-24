from typing import Annotated

from asgiref.sync import sync_to_async
from django.core.management.base import BaseCommand
from django.db import close_old_connections

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field

from vaults.models import Vault
from vaults.retrieval import search_sources

server = FastMCP("ReszVault Demo")


@server.tool(annotations=ToolAnnotations(readOnlyHint=True))
async def search_vault_sources(
    vault_slug: Annotated[str, Field(description="Demo vault slug, such as returns or shipping.")],
    question: Annotated[str, Field(min_length=1, max_length=500)],
) -> list[dict[str, str | int]]:
    """Return matching PDF excerpts and page numbers from the specified demo vault."""
    if not question.strip():
        raise ToolError("Question cannot be blank.")
    return await find_passages(vault_slug, question)


@sync_to_async
def find_passages(vault_slug, question):
    close_old_connections()
    try:
        vault = Vault.objects.get(slug=vault_slug)
        return search_sources(vault, question)
    except Vault.DoesNotExist as exc:
        raise ToolError(f"Unknown demo vault: {vault_slug}") from exc
    finally:
        close_old_connections()


class Command(BaseCommand):
    help = "Run the read-only demo vault MCP server over stdio."

    def handle(self, *args, **options):
        server.run(transport="stdio")
