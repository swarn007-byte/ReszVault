from django.contrib import admin

from .models import Account, Book, Chunk, RepositoryIndex


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    fields = ("id", "name", "email", "image", "created_at")
    list_display = ("name", "email", "created_at")
    search_fields = ("name", "email")


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("title", "owner_key", "status", "chunk_count", "created_at")
    list_filter = ("status",)
    search_fields = ("title", "filename", "owner_key")
    readonly_fields = ("chunk_count",)


@admin.register(Chunk)
class ChunkAdmin(admin.ModelAdmin):
    list_display = ("book", "page", "chunk_index")
    list_select_related = ("book",)
    search_fields = ("content", "book__title")


@admin.register(RepositoryIndex)
class RepositoryIndexAdmin(admin.ModelAdmin):
    list_display = ("repo_id", "chunk_count", "stale", "error")
    search_fields = ("repo_id",)
