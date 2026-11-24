from django.db import models


class Vault(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)

    def __str__(self):
        return self.name


class Source(models.Model):
    vault = models.ForeignKey(Vault, on_delete=models.CASCADE, related_name="sources")
    title = models.CharField(max_length=160)
    filename = models.CharField(max_length=160)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["vault", "filename"], name="unique_vault_filename")
        ]

    def __str__(self):
        return self.title


class Chunk(models.Model):
    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="chunks")
    page = models.PositiveIntegerField()
    position = models.PositiveIntegerField()
    text = models.TextField()

    class Meta:
        ordering = ["source_id", "position"]
        constraints = [
            models.UniqueConstraint(fields=["source", "position"], name="unique_source_position")
        ]

    def __str__(self):
        return f"{self.source}, page {self.page}"
