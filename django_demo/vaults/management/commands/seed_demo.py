from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from document_parser import split_pdf_chunks
from vaults.models import Chunk, Source, Vault

SAMPLES = [
    ("returns", "Returns", "Return Policy", "return-policy.pdf"),
    ("shipping", "Shipping", "Shipping Guide", "shipping-guide.pdf"),
]


class Command(BaseCommand):
    help = "Load the sample vaults from the two bundled PDFs."

    @transaction.atomic
    def handle(self, *args, **options):
        pdf_dir = Path(__file__).resolve().parents[2] / "sample_pdfs"
        for slug, name, title, filename in SAMPLES:
            passages = split_pdf_chunks((pdf_dir / filename).read_bytes())
            if not passages:
                raise CommandError(f"No text extracted from {filename}")

            vault, _ = Vault.objects.update_or_create(slug=slug, defaults={"name": name})
            source, _ = Source.objects.update_or_create(
                vault=vault, filename=filename, defaults={"title": title}
            )
            source.chunks.all().delete()
            Chunk.objects.bulk_create(
                Chunk(source=source, page=passage.page, position=position, text=passage.text)
                for position, passage in enumerate(passages)
            )
        self.stdout.write(self.style.SUCCESS("Sample vaults loaded."))
