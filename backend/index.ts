import express from "express";
import multer from "multer";
import { pipeline } from "@huggingface/transformers";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { requireAuth, type AuthedRequest } from "./lib/session";
import { ingestPdfBuffer } from "./lib/ingest-pdf";

const generateEmbedding = await pipeline("feature-extraction", "Supabase/gte-small");

const app = express();

const allowedOrigins = new Set(
  [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:4173",
    process.env.FRONTEND_ORIGIN,
    "https://reszvault.vercel.app",
  ].filter((o): o is string => Boolean(o)),
);

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.all(/^\/api\/auth\/(.*)/, (req, res) => {
  return toNodeHandler(auth)(req, res);
});

app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY || "fallback-key-for-typescript",
  model: "llama-3.1-8b-instant",
  temperature: 0.2,
});

const OFF_TOPIC_REPLY = "ahn !! my mother didn't taught me about this";
const RELEVANCE_DISTANCE_THRESHOLD = 0.42;
const DEFAULT_BOOK_TITLE = "ReszVault";

function makeChatPrompt(bookTitle: string, isDefaultCorpus: boolean) {
  const scope = isDefaultCorpus
    ? `the active ReszVault workspace`
    : `the book "${bookTitle}"`;

  const offTopicRule = isDefaultCorpus
    ? `If the user asks a question that cannot be answered from the active ReszVault context, say the uploaded sources do not contain enough evidence.`
    : `If the question is clearly unrelated to "${bookTitle}", say you can only discuss this book.`;

  return ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a kind, empathic, concise literary assistant specializing ONLY in ${scope}.

     CORE RULES:
     1. Answer using ONLY the context passages provided below. Do not invent plot or characters.
     2. Be direct and engaging. Use markdown when helpful.
     3. OFF-TOPIC GUARDRAIL: ${offTopicRule}`,
    ],
    ["human", "Context from the book:\n{context}\n\nQuestion: {question}"],
  ]);
}

function isClearlyOffTopic(question: string): boolean {
  const q = question.toLowerCase();
  const bookSignals =
    /\b(reszvault|research|document|pdf|source|citation|summary|paper|report|resume|vault)\b/i;
  if (bookSignals.test(q)) return false;

  const offTopicSignals =
    /\b(israel|gaza|palestin|trump|biden|modi|putin|election|prime minister|\bpm\b|president|congress|parliament|python|javascript|typescript|react|code|coding|crypto|bitcoin|stock market|weather forecast|recipe|football|nba|iphone|android)\b/i;
  return offTopicSignals.test(q);
}

function normalizeGuardrailAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (/am\s*i\s*fool/i.test(trimmed) || /^i'?m\s*a\s*fool/i.test(trimmed)) {
    return OFF_TOPIC_REPLY;
  }
  return trimmed;
}

type ChatPrepareResult =
  | { kind: "guardrail"; answer: string }
  | { kind: "error"; status: number; message: string }
  | { kind: "ready"; context: string; sourcesUsed: number; bookTitle: string; isDefaultCorpus: boolean };

async function prepareChat(
  question: string,
  options: { bookId?: string | null; userId?: string },
): Promise<ChatPrepareResult> {
  const { bookId, userId } = options;
  let bookTitle = DEFAULT_BOOK_TITLE;
  let isDefaultCorpus = true;

  if (bookId) {
    if (!userId) {
      return { kind: "error", status: 401, message: "Sign in to chat with your uploaded book." };
    }

    const book = await prisma.book.findFirst({
      where: { id: bookId, userId },
    });

    if (!book) {
      return { kind: "error", status: 404, message: "Book not found." };
    }
    if (book.status === "processing") {
      return { kind: "error", status: 409, message: "This book is still being processed. Try again shortly." };
    }
    if (book.status === "failed") {
      return { kind: "error", status: 422, message: book.error ?? "This book failed to process." };
    }

    bookTitle = book.title;
    isDefaultCorpus = false;
  } else if (isClearlyOffTopic(question)) {
    return { kind: "guardrail", answer: OFF_TOPIC_REPLY };
  }

  const output = await generateEmbedding(question, {
    pooling: "mean",
    normalize: true,
  });
  const queryEmbedding = Array.from(output.data as ArrayLike<number>);
  const vectorString = `[${queryEmbedding.join(",")}]`;

  const matchingChunks: { content: string; distance: number }[] = bookId
    ? await prisma.$queryRawUnsafe(
        `SELECT content, (embedding <=> $1::vector) AS distance FROM "documents" WHERE "bookId" = $2 ORDER BY distance LIMIT 6;`,
        vectorString,
        bookId,
      )
    : await prisma.$queryRawUnsafe(
        `SELECT content, (embedding <=> $1::vector) AS distance FROM "documents" WHERE "bookId" IS NULL ORDER BY distance LIMIT 6;`,
        vectorString,
      );

  if (!matchingChunks?.length) {
    return {
      kind: "error",
      status: 404,
      message: bookId ? "No text found for this book yet." : "No book context found inside the database.",
    };
  }

  const bestDistance = Number(matchingChunks[0]?.distance ?? 2);
  if (bestDistance > RELEVANCE_DISTANCE_THRESHOLD) {
    return { kind: "guardrail", answer: OFF_TOPIC_REPLY };
  }

  return {
    kind: "ready",
    context: matchingChunks.map((chunk) => chunk.content).join("\n\n"),
    sourcesUsed: matchingChunks.length,
    bookTitle,
    isDefaultCorpus,
  };
}

function initSse(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

function sendSse(res: express.Response, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function streamFixedText(res: express.Response, text: string, sourcesUsed = 0) {
  for (const char of text) {
    sendSse(res, { token: char });
    await new Promise((r) => setTimeout(r, 16));
  }
  sendSse(res, { done: true, sourcesUsed, answer: text });
  res.end();
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.pdf$/i, "").trim() || "Untitled book";
}

function serializeBook(book: {
  id: string;
  title: string;
  filename: string;
  status: string;
  chunkCount: number;
  error: string | null;
  createdAt: Date;
}) {
  return {
    id: book.id,
    title: book.title,
    filename: book.filename,
    status: book.status,
    chunkCount: book.chunkCount,
    error: book.error,
    createdAt: book.createdAt.toISOString(),
  };
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// --- BOOKS: list / upload / delete user PDFs ---
app.get("/books", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const books = await prisma.book.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
    });
    res.json({ books: books.map(serializeBook) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list books";
    res.status(500).json({ error: message });
  }
});

async function processBookUpload(bookId: string, pdfBuffer: Buffer) {
  try {
    const chunkCount = await ingestPdfBuffer(prisma, generateEmbedding as never, pdfBuffer, bookId);

    if (chunkCount === 0) {
      await prisma.book.update({
        where: { id: bookId },
        data: { status: "failed", error: "No readable text found in PDF." },
      });
      return;
    }

    await prisma.book.update({
      where: { id: bookId },
      data: { status: "ready", chunkCount },
    });
    console.log(`Book ${bookId}: indexed ${chunkCount} chunks`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ingestion failed";
    console.error(`Book ${bookId} ingest failed:`, err);
    await prisma.book.update({
      where: { id: bookId },
      data: { status: "failed", error: message },
    });
  }
}

app.post("/books/upload", requireAuth, upload.single("file"), async (req: AuthedRequest, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "PDF file is required (field name: file)" });
    }

    const title =
      typeof req.body?.title === "string" && req.body.title.trim()
        ? req.body.title.trim()
        : titleFromFilename(file.originalname);

    const book = await prisma.book.create({
      data: {
        userId: req.userId!,
        title,
        filename: file.originalname,
        status: "processing",
      },
    });

    const buffer = Buffer.from(file.buffer);
    void processBookUpload(book.id, buffer);

    res.status(202).json({
      success: true,
      book: serializeBook(book),
      message: `Processing "${title}" — this may take a minute.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("Book upload error:", err);
    res.status(500).json({ error: "Upload failed", details: message });
  }
});

app.delete("/books/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const bookId = String(req.params.id);
    const book = await prisma.book.findFirst({
      where: { id: bookId, userId: req.userId! },
    });
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    await prisma.book.delete({ where: { id: book.id } });
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    res.status(500).json({ error: message });
  }
});

// --- INGEST (admin: Google Drive URL → global corpus) ---
app.post("/ingest", async (req, res) => {
  try {
    const driveLink = req.body.url;
    if (!driveLink) {
      return res.status(400).json({ error: "URL field required" });
    }

    const matches = driveLink.match(/\/d\/([^/]+)/);
    if (!matches?.[1]) {
      return res.status(400).json({ error: "Invalid Drive link format" });
    }

    const fileId = matches[1];
    const directDownloadUrl = `https://docs.google.com/uc?export=download&id=${fileId}`;
    const response = await fetch(directDownloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const savedCount = await ingestPdfBuffer(prisma, generateEmbedding as never, buffer, null);

    res.json({
      success: true,
      message: `Successfully embedded and saved ${savedCount} chunks to the default corpus.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(err);
    res.status(500).json({ error: "Ingestion failed", details: message });
  }
});

// --- CHAT ---
app.post("/chat", async (req, res) => {
  try {
    const { question, bookId } = req.body as { question?: string; bookId?: string };
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    let userId: string | undefined;
    if (bookId) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      userId = session?.user?.id;
    }

    const prepared = await prepareChat(question, { bookId: bookId ?? null, userId });
    if (prepared.kind === "guardrail") {
      return res.json({ success: true, question, answer: prepared.answer, sourcesUsed: 0 });
    }
    if (prepared.kind === "error") {
      return res.status(prepared.status).json({ error: prepared.message });
    }

    const ragChain = makeChatPrompt(prepared.bookTitle, prepared.isDefaultCorpus)
      .pipe(model)
      .pipe(new StringOutputParser());

    const rawAnswer = await ragChain.invoke({ context: prepared.context, question });
    const answerText = normalizeGuardrailAnswer(rawAnswer);

    res.json({
      success: true,
      question,
      answer: answerText,
      sourcesUsed: prepared.sourcesUsed,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("LangChain Chat Error:", err);
    res.status(500).json({ error: "Chat processing failed", details: message });
  }
});

app.post("/chat/stream", async (req, res) => {
  try {
    const { question, bookId } = req.body as { question?: string; bookId?: string };
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    let userId: string | undefined;
    if (bookId) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      userId = session?.user?.id;
    }

    const prepared = await prepareChat(question, { bookId: bookId ?? null, userId });
    initSse(res);

    if (prepared.kind === "guardrail") {
      await streamFixedText(res, prepared.answer, 0);
      return;
    }
    if (prepared.kind === "error") {
      sendSse(res, { error: prepared.message });
      res.end();
      return;
    }

    const ragChain = makeChatPrompt(prepared.bookTitle, prepared.isDefaultCorpus)
      .pipe(model)
      .pipe(new StringOutputParser());

    let fullText = "";
    const stream = await ragChain.stream({ context: prepared.context, question });

    for await (const chunk of stream) {
      const token = typeof chunk === "string" ? chunk : String(chunk);
      fullText += token;
      sendSse(res, { token });
    }

    const answerText = normalizeGuardrailAnswer(fullText);
    if (answerText !== fullText.trim()) {
      sendSse(res, { replace: true, answer: answerText });
    }
    sendSse(res, { done: true, sourcesUsed: prepared.sourcesUsed, answer: answerText });
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("LangChain Stream Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Chat streaming failed", details: message });
    } else {
      sendSse(res, { error: message });
      res.end();
    }
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  console.log(`Chat off-topic reply: "${OFF_TOPIC_REPLY}"`);
});
