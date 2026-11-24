from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from github_research import accessible_repository, github_token, start_sync
from repository_index import index_key, index_status
from .authentication import current_session
from .http import RequestError
from .models import Project, ProjectRepository
from .pdf_views import BookSerializer, book_contexts, find_books, save_pdf
from .project_chat import answer_project


class ProjectInput(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    description = serializers.CharField(max_length=300, required=False, allow_blank=True)


class RepositoryInput(serializers.Serializer):
    repository = serializers.RegexField(r"^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+$", max_length=200)
    refresh = serializers.BooleanField(default=False)


class QuestionInput(serializers.Serializer):
    question = serializers.CharField(max_length=4000)
    previous_questions = serializers.ListField(child=serializers.CharField(max_length=1000), max_length=4, default=list)


def account(request):
    session = current_session(request)
    if not session:
        raise RequestError(401, "Sign in to open your projects.")
    return session.user


def owned_project(request, project_id):
    return get_object_or_404(Project, pk=project_id, owner=account(request))


def project_summary(project):
    return {"id": project.id, "name": project.name, "description": project.description, "createdAt": project.created_at}


def repository_source(repository):
    return {"id": repository.id, "name": repository.name, **index_status(repository.index_key)}


@api_view(["GET", "POST"])
def projects(request):
    owner = account(request)
    if request.method == "POST":
        form = ProjectInput(data=request.data)
        form.is_valid(raise_exception=True)
        project = Project.objects.create(owner=owner, **form.validated_data)
        return Response({**project_summary(project), "pdfCount": 0, "repoCount": 0}, status=201)

    rows = Project.objects.filter(owner=owner).annotate(
        pdf_count=Count("books", distinct=True), repo_count=Count("repositories", distinct=True),
    ).order_by("-created_at")
    return Response([
        {**project_summary(project), "pdfCount": project.pdf_count, "repoCount": project.repo_count}
        for project in rows
    ])


@api_view(["GET"])
def project_detail(request, project_id):
    project = owned_project(request, project_id)
    books = find_books(f"user:{project.owner_id}", project=project)
    return Response({
        **project_summary(project),
        "pdfs": BookSerializer(books, many=True).data,
        "repositories": [repository_source(item) for item in project.repositories.order_by("id")],
    })


@api_view(["POST"])
def project_pdf(request, project_id):
    project = owned_project(request, project_id)
    book = save_pdf(request, f"user:{project.owner_id}", project=project)
    return Response(BookSerializer(book).data, status=201)


@api_view(["POST"])
def project_repository(request, project_id):
    project = owned_project(request, project_id)
    form = RepositoryInput(data=request.data)
    form.is_valid(raise_exception=True)
    token = github_token(request, required=False)
    repo = accessible_repository(form.validated_data["repository"], token)
    start_sync(token, repo, force=form.validated_data["refresh"])
    item, created = ProjectRepository.objects.update_or_create(
        project=project, index_key=index_key(repo), defaults={"name": repo["full_name"]},
    )
    return Response(repository_source(item), status=201 if created else 200)


@api_view(["POST"])
def project_chat(request, project_id):
    project = owned_project(request, project_id)
    form = QuestionInput(data=request.data)
    form.is_valid(raise_exception=True)
    books = book_contexts(find_books(f"user:{project.owner_id}", project=project).prefetch_related("chunks"))
    repositories = list(project.repositories.order_by("id"))
    return Response(answer_project(
        form.validated_data["question"], form.validated_data["previous_questions"],
        books, repositories, github_token(request, required=False) if repositories else None,
    ))
