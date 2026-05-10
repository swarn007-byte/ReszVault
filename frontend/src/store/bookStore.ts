import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BookRecord } from "../api/books";
import { deleteBook, listBooks, uploadBook } from "../api/books";

/** null = whole ReszVault workspace */
export type SelectedBook = { kind: "default" } | { kind: "user"; id: string };

type BookState = {
  books: BookRecord[];
  selected: SelectedBook;
  loading: boolean;
  uploading: boolean;
  error: string | null;
  setSelected: (selected: SelectedBook) => void;
  fetchBooks: () => Promise<void>;
  uploadPdf: (file: File, title?: string) => Promise<BookRecord>;
  removeBook: (id: string) => Promise<void>;
  selectedBookId: () => string | null;
  selectedLabel: () => string;
};

export const useBookStore = create<BookState>()(
  persist(
    (set, get) => ({
      books: [],
      selected: { kind: "default" },
      loading: false,
      uploading: false,
      error: null,

      setSelected: (selected) => set({ selected, error: null }),

      selectedBookId: () => {
        const { selected } = get();
        return selected.kind === "user" ? selected.id : null;
      },

      selectedLabel: () => {
        const { selected, books } = get();
        if (selected.kind === "default") return "ReszVault";
        return books.find((b) => b.id === selected.id)?.title ?? "My book";
      },

      fetchBooks: async () => {
        set({ loading: true, error: null });
        try {
          const books = await listBooks();
          const { selected } = get();
          if (selected.kind === "user" && !books.some((b) => b.id === selected.id)) {
            set({ books, selected: { kind: "default" } });
          } else {
            set({ books });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not load books";
          // Don't block chat when the books API isn't reachable yet (e.g. old deploy, dev proxy).
          if (message.includes("404")) {
            set({ books: [], error: null });
          } else if (message.includes("401")) {
            set({ books: [], error: null });
          } else {
            set({ error: message });
          }
        } finally {
          set({ loading: false });
        }
      },

      uploadPdf: async (file, title) => {
        set({ uploading: true, error: null });
        try {
          const book = await uploadBook(file, title);
          set((state) => ({
            books: [book, ...state.books.filter((b) => b.id !== book.id)],
            selected: { kind: "user", id: book.id },
            uploading: book.status === "processing",
          }));

          if (book.status === "processing") {
            const poll = async (attempts = 0): Promise<BookRecord> => {
              if (attempts > 40) throw new Error("Indexing timed out — try a smaller PDF.");
              await new Promise((r) => setTimeout(r, 3000));
              const books = await listBooks();
              const updated = books.find((b) => b.id === book.id);
              if (!updated) throw new Error("Upload lost — try again.");
              set({ books });
              if (updated.status === "processing") return poll(attempts + 1);
              if (updated.status === "failed") {
                throw new Error(updated.error ?? "PDF indexing failed.");
              }
              return updated;
            };
            const ready = await poll();
            set({ uploading: false });
            return ready;
          }

          set({ uploading: false });
          return book;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          set({ error: message, uploading: false });
          throw err;
        }
      },

      removeBook: async (id) => {
        await deleteBook(id);
        const { selected } = get();
        set((state) => ({
          books: state.books.filter((b) => b.id !== id),
          selected: selected.kind === "user" && selected.id === id ? { kind: "default" } : selected,
        }));
      },
    }),
    {
      name: "reszvault-books",
      partialize: (state) => ({ selected: state.selected }),
    },
  ),
);
