from rest_framework import serializers

from .models import Source, Vault


class SourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Source
        fields = ("id", "title", "filename")


class VaultSerializer(serializers.ModelSerializer):
    sources = SourceSerializer(many=True, read_only=True)

    class Meta:
        model = Vault
        fields = ("slug", "name", "sources")


class QuestionSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=500)
