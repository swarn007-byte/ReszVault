import json
import re
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from document_parser import Chunk as TextChunk, split_pdf_chunks
from rag import BookContext, answer_question

from .authentication import request_owner
from .http import RequestError
from .models import Book, Chunk


class BookSerializer(serializers.ModelSerializer):
    chunkCount = serializers.IntegerField(source="chunk_count")
    createdAt = serializers.DateTimeField(source="created_at")

    class Meta:
        model = Book
        fields = ("id", "title", "filename", "status", "chunkCount", "error", "createdAt")


class BookQuestion(serializers.Serializer):
    question = serializers.CharField(max_length=4000)
    bookId = serializers.CharField(required=False, allow_null=True, max_length=80)
    bookIds = serializers.ListField(
        child=serializers.CharField(max_length=80), required=False, allow_null=True, max_length=250
    )
    useHybrid = serializers.BooleanField(default=True)


def find_books(owner, ids=None):
    books = Book.objects.filter(owner_key=owner).defer("pdf").order_by("-created_at")
    return books if ids is None else books.filter(pk__in=ids)


def book_contexts(books):
    return [
        BookContext(
            id=book.id, title=book.title,
            chunks=[TextChunk(text=chunk.content, page=chunk.page) for chunk in book.chunks.all()],
        )
        for book in books if book.status == "ready"
    ]


@api_view(["GET"])
def health(request):
    Book.objects.exists()
    return Response({"status": "ok", "backend": "django"})


@api_view(["GET"])
def root(request):
    return Response({"name": "ReszVault Django REST API", "status": "ok"})


@api_view(["GET"])
def list_books(request):
    owner = request_owner(request)
    return Response({"books": BookSerializer(find_books(owner), many=True).data if owner else []})


@api_view(["POST"])
def upload_book(request):
    owner = request_owner(request)
    if not owner:
        raise RequestError(400, "A vault session is required for upload.")
    upload = request.FILES.get("file")
    if not upload or not upload.name.lower().endswith(".pdf"):
        raise RequestError(400, "Only PDF files are allowed.")
    if upload.size > settings.MAX_PDF_BYTES:
        raise RequestError(413, "PDFs must be no larger than 20 MB.")
    raw = upload.read()
    if b"%PDF-" not in raw[:1024]:
        raise RequestError(400, "The uploaded file is not a readable PDF.")
    try:
        passages = split_pdf_chunks(raw)
    except Exception as error:
        raise RequestError(400, "The uploaded PDF could not be parsed.") from error
    if not passages:
        raise RequestError(400, "No readable text found in PDF.")
    title = str(request.data.get("title") or "").strip() or re.sub(r"\.pdf$", "", upload.name, flags=re.I)
    with transaction.atomic():
        book = Book.objects.create(
            id=f"book_{uuid4().hex}", owner_key=owner, title=title, filename=upload.name,
            status="ready", chunk_count=len(passages), pdf=raw,
        )
        Chunk.objects.bulk_create([
            Chunk(id=f"chunk_{uuid4().hex}", book=book, content=passage.text, chunk_index=index, page=passage.page)
            for index, passage in enumerate(passages)
        ])
    return Response({"success": True, "book": BookSerializer(book).data, "message": "PDF indexed."}, status=202)


@api_view(["GET", "DELETE"])
def book_detail(request, book_id):
    owner = request_owner(request)
    if not owner:
        raise RequestError(401, "Sign in required")
    book = get_object_or_404(find_books(owner), pk=book_id)
    if request.method == "DELETE":
        book.delete()
        return Response({"success": True})
    return Response({"book": BookSerializer(book).data})


def resolve_answer(request):
    form = BookQuestion(data=request.data)
    form.is_valid(raise_exception=True)
    payload = form.validated_data
    owner = request_owner(request)
    if not owner:
        raise RequestError(409, "Open a guest vault or sign in before asking questions.")
    ids = payload.get("bookIds")
    if payload.get("bookId"):
        ids = [*ids, payload["bookId"]] if ids is not None else [payload["bookId"]]
    books = list(find_books(owner, ids).prefetch_related("chunks"))
    processing = sum(book.status == "processing" for book in books)
    if processing:
        raise RequestError(409, f"Your vault is still indexing {processing} PDF(s).")
    failed = next((book for book in books if book.status == "failed"), None)
    if failed and not any(book.status == "ready" for book in books):
        raise RequestError(409, failed.error or "The selected PDFs failed during indexing.")
    contexts = book_contexts(books)
    answer, sources = answer_question(payload["question"], contexts, use_hybrid=payload["useHybrid"])
    return {"success": True, "question": payload["question"], "answer": answer, "sourcesUsed": sources}


@api_view(["POST"])
def chat(request):
    return Response(resolve_answer(request))


@api_view(["POST"])
def chat_stream(request):
    result = resolve_answer(request)

    def events():
        for offset in range(0, len(result["answer"]), 24):
            yield f"data: {json.dumps({'token': result['answer'][offset:offset + 24]})}\n\n"
        yield f"data: {json.dumps({'done': True, 'sourcesUsed': result['sourcesUsed'], 'answer': result['answer']})}\n\n"

    response = StreamingHttpResponse(events(), content_type="text/event-stream")
    response["X-Accel-Buffering"] = "no"
    return response
