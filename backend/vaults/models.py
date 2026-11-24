from uuid import uuid4

from django.db import models
from django.utils import timezone


class Account(models.Model):
    id = models.CharField(primary_key=True, max_length=80)
    name = models.TextField()
    email = models.EmailField(unique=True)
    image = models.TextField(null=True, blank=True)
    password_hash = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.name


class AppSession(models.Model):
    token = models.CharField(primary_key=True, max_length=64)
    user = models.ForeignKey(Account, on_delete=models.CASCADE)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(default=timezone.now)


class GithubSession(models.Model):
    session = models.OneToOneField(AppSession, primary_key=True, on_delete=models.CASCADE)
    access_token = models.TextField()


class OAuthAttempt(models.Model):
    state = models.CharField(primary_key=True, max_length=64)
    provider = models.CharField(max_length=12)
    verifier = models.TextField(blank=True)
    browser_challenge = models.CharField(max_length=64)
    callback_path = models.TextField(blank=True)
    expires_at = models.DateTimeField(db_index=True)


class OAuthHandoff(models.Model):
    code = models.CharField(primary_key=True, max_length=64)
    provider = models.CharField(max_length=12)
    browser_challenge = models.CharField(max_length=64)
    user = models.ForeignKey(Account, on_delete=models.CASCADE)
    access_token = models.TextField(blank=True)
    callback_path = models.TextField(blank=True)
    expires_at = models.DateTimeField(db_index=True)


class RepositoryIndex(models.Model):
    repo_id = models.TextField(primary_key=True)
    chunks = models.JSONField(default=list)
    vectors = models.BinaryField(null=True, blank=True)
    chunk_count = models.PositiveIntegerField(default=0)
    synced_at = models.PositiveBigIntegerField(null=True)
    stale = models.PositiveBigIntegerField(default=0)
    lease = models.CharField(max_length=32, null=True)
    lease_until = models.PositiveBigIntegerField(default=0)
    error = models.BooleanField(default=False)


class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    owner = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(default=timezone.now)


class ProjectRepository(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="repositories")
    name = models.CharField(max_length=200)
    index_key = models.CharField(max_length=300)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "index_key"], name="unique_project_repository"),
        ]


class Book(models.Model):
    id = models.CharField(primary_key=True, max_length=80)
    owner_key = models.CharField(max_length=110)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="books", null=True, blank=True)
    title = models.TextField()
    filename = models.TextField()
    status = models.CharField(max_length=20)
    chunk_count = models.PositiveIntegerField(default=0)
    error = models.TextField(null=True, blank=True)
    pdf = models.BinaryField(null=True, editable=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=["owner_key", "-created_at"], name="book_owner_created_idx")]

    def __str__(self):
        return self.title


class Chunk(models.Model):
    id = models.CharField(primary_key=True, max_length=80)
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name="chunks")
    content = models.TextField()
    chunk_index = models.PositiveIntegerField()
    page = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["book_id", "chunk_index"]
        constraints = [models.UniqueConstraint(fields=["book", "chunk_index"], name="unique_book_chunk")]
