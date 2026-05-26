import { getApiBase } from "../lib/api-base";
import { getGuestId } from "../lib/guest-id";

export type BookRecord = {
  id: string;
  title: string;
  filename: string;
  status: "processing" | "ready" | "failed";
  chunkCount: number;
  error: string | null;
  createdAt: string;
};

async function booksFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "x-guest-id": getGuestId(),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    details?: string;
    books?: BookRecord[];
    book?: BookRecord;
    success?: boolean;
    message?: string;
  };
  if (!res.ok && res.status !== 202) {
    throw new Error(body.details ?? body.error ?? `Request failed (${res.status})`);
  }
  return body;
}

export async function listBooks(): Promise<BookRecord[]> {
  const data = await booksFetch("/books");
  return data.books ?? [];
}

export async function uploadBook(file: File, title?: string): Promise<BookRecord> {
  const form = new FormData();
  form.append("file", file);
  if (title?.trim()) form.append("title", title.trim());

  const data = await booksFetch("/books/upload", {
    method: "POST",
    body: form,
  });
  if (data.success === false) {
    throw new Error(data.message ?? data.error ?? "Upload failed");
  }
  if (!data.book) throw new Error("Upload succeeded but no book returned");
  return data.book;
}

export async function deleteBook(id: string): Promise<void> {
  await booksFetch(`/books/${id}`, { method: "DELETE" });
}
