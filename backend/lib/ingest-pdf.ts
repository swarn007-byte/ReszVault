import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PDFParse } from "pdf-parse";
import type { PrismaClient } from "@prisma/client";

const MAX_CHUNKS = 120;

type EmbeddingPipeline = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: ArrayLike<number> | Iterable<number> }>;

export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const result = await parser.getText();
    return result.text.replace(/\s+/g, " ").trim();
  } finally {
    await parser.destroy();
  }
}

export async function ingestPdfBuffer(
  prisma: PrismaClient,
  generateEmbedding: EmbeddingPipeline,
  pdfBuffer: Buffer,
  bookId: string | null,
): Promise<number> {
  const fullText = await extractPdfText(pdfBuffer);
  if (!fullText) return 0;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 400,
    chunkOverlap: 40,
  });

  const chunks = await splitter.splitText(fullText);
  let savedCount = 0;

  for (const cleanContent of chunks) {
    if (!cleanContent.trim()) continue;
    if (savedCount >= MAX_CHUNKS) break;

    const output = await generateEmbedding(cleanContent, {
      pooling: "mean",
      normalize: true,
    });

    const embedding = Array.from(output.data as Iterable<number>);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "documents" (content, metadata, embedding, "bookId") VALUES ($1, $2, $3::vector, $4)`,
      cleanContent,
      JSON.stringify({ source: "pdf-upload" }),
      `[${embedding.join(",")}]`,
      bookId,
    );

    savedCount++;
  }

  return savedCount;
}
