import { api } from "./client";
import { getApiBase } from "../lib/api-base";
import { getGuestId } from "../lib/guest-id";

export type ChatApiResponse = {
  success: boolean;
  question: string;
  answer: string;
  sourcesUsed: number;
  sources?: {
    title: string;
    page?: number | null;
    excerpt: string;
    score?: number;
  }[];
};

export type StreamCallbacks = {
  onToken: (token: string) => void;
  onReplace?: (answer: string) => void;
  onDone?: (meta: { sourcesUsed: number; answer?: string }) => void;
  onError?: (message: string) => void;
};

type SsePayload = {
  token?: string;
  replace?: boolean;
  answer?: string;
  done?: boolean;
  sourcesUsed?: number;
  error?: string;
};

function toFriendlyChatError(message?: string): string {
  if (!message) return "The vault could not answer right now. Please try again.";
  const normalized = message.toLowerCase();
  if (
    normalized.includes("prisma") ||
    normalized.includes("queryraw") ||
    normalized.includes("enotfound") ||
    normalized.includes("tenant/user") ||
    normalized.includes("database")
  ) {
    return "I could not reach a source for this chat. Upload a PDF or choose an indexed project source.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "The chat service is not reachable right now. Please check the server and try again.";
  }
  if (normalized.includes("still indexing") || normalized.includes("indexing to finish")) {
    return message;
  }
  return message;
}

/** Non-streaming endpoint used as a fallback by older surfaces. */
export async function sendQuestion(
  question: string,
  bookId?: string | null,
  bookIds?: string[],
): Promise<ChatApiResponse> {
  const { data } = await api.post<ChatApiResponse>("/chat", {
    question,
    ...(bookId ? { bookId } : {}),
    ...(bookIds?.length ? { bookIds } : {}),
  });
  return data;
}

/**
 * Stream tokens via Server-Sent Events (SSE) — same UX as ChatGPT typing.
 */
export async function streamQuestion(
  question: string,
  callbacks: StreamCallbacks,
  options?: { bookId?: string | null; bookIds?: string[]; signal?: AbortSignal },
): Promise<void> {
  const { bookId, bookIds, signal } = options ?? {};
  const res = await fetch(`${getApiBase()}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-guest-id": getGuestId() },
    credentials: "include",
    body: JSON.stringify({
      question,
      ...(bookId ? { bookId } : {}),
      ...(bookIds?.length ? { bookIds } : {}),
    }),
    signal,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
    callbacks.onError?.(
      toFriendlyChatError(body.details ?? body.error ?? `Request failed (${res.status})`),
    );
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError?.("Streaming not supported in this browser.");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      let payload: SsePayload;
      try {
        payload = JSON.parse(raw) as SsePayload;
      } catch {
        continue;
      }

      if (payload.error) {
        callbacks.onError?.(toFriendlyChatError(payload.error));
        return;
      }
      if (payload.token) callbacks.onToken(payload.token);
      if (payload.replace && payload.answer) callbacks.onReplace?.(payload.answer);
      if (payload.done) {
        callbacks.onDone?.({
          sourcesUsed: payload.sourcesUsed ?? 0,
          answer: payload.answer,
        });
      }
    }
  }
}

export async function checkHealth(): Promise<{ status: string }> {
  const { data } = await api.get<{ status: string }>("/health");
  return data;
}
