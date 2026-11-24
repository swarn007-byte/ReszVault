from django.contrib import admin

from .models import Chunk, Source, Vault


@admin.register(Vault)
class VaultAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Source)
class SourceAdmin(admin.ModelAdmin):
    list_display = ("title", "vault", "filename")
    list_filter = ("vault",)
    list_select_related = ("vault",)


@admin.register(Chunk)
class ChunkAdmin(admin.ModelAdmin):
    list_display = ("source", "page", "position")
    list_filter = ("source__vault",)
    list_select_related = ("source",)
    search_fields = ("text",)
