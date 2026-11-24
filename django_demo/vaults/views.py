from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Vault
from .retrieval import answer_question
from .serializers import QuestionSerializer, VaultSerializer


class VaultListView(ListAPIView):
    queryset = Vault.objects.prefetch_related("sources").order_by("name")
    serializer_class = VaultSerializer


class VaultAskView(APIView):
    def post(self, request, slug):
        vault = get_object_or_404(Vault, slug=slug)
        question = QuestionSerializer(data=request.data)
        question.is_valid(raise_exception=True)
        return Response(answer_question(vault, question.validated_data["question"]))
