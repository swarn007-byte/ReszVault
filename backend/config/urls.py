from django.contrib import admin
from django.urls import path

import github_research as github
from vaults import account_views as auth, pdf_views as pdf, project_views as projects

urlpatterns = [
    path("", pdf.root),
    path("health", pdf.health),
    path("admin/", admin.site.urls),
    path("auth/providers", auth.providers),
    path("api/auth/session", auth.session),
    path("api/auth/get-session", auth.session),
    path("api/auth/sign-up/email", auth.sign_up),
    path("api/auth/sign-in/email", auth.sign_in),
    path("api/auth/sign-out", auth.sign_out),
    path("api/auth/google/start", auth.google_start),
    path("api/auth/google/callback", auth.google_callback),
    path("api/auth/github/start", github.start),
    path("api/auth/github/callback", github.callback),
    path("api/auth/<str:provider>/exchange", auth.exchange),
    path("api/projects", projects.projects),
    path("api/projects/<uuid:project_id>", projects.project_detail),
    path("api/projects/<uuid:project_id>/pdfs", projects.project_pdf),
    path("api/projects/<uuid:project_id>/repositories", projects.project_repository),
    path("api/projects/<uuid:project_id>/chat", projects.project_chat),
    path("books", pdf.list_books),
    path("books/upload", pdf.upload_book),
    path("books/<str:book_id>", pdf.book_detail),
    path("chat", pdf.chat),
    path("chat/stream", pdf.chat_stream),
    path("api/github/access", github.access),
    path("api/github/chat", github.repository_chat),
    path("api/github/repositories/<str:owner>/<str:repository>", github.authorize_repository),
    path("api/github/repositories/<str:owner>/<str:repository>/index", github.repository_index),
    path("api/github/webhook", github.github_webhook),
]
