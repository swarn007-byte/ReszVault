from django.urls import path

from .views import VaultAskView, VaultListView

urlpatterns = [
    path("vaults/", VaultListView.as_view(), name="demo-vault-list"),
    path("vaults/<slug:slug>/ask/", VaultAskView.as_view(), name="demo-vault-ask"),
]
