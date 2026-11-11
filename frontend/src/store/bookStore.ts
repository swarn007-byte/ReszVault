import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BookRecord } from "../api/books";
import { deleteBook, getBook, listBooks, uploadBook } from "../api/books";

/** default = whole project / all ready sources */
export type SelectedBook = { kind: "default" } | { kind: "user"; id: string };

type BookState = {
  books: BookRecord[];
  projectBookIds: Record<string, string[]>;
  selected: SelectedBook;
  loading: boolean;
  uploading: boolean;
  error: string | null;
  setSelected: (selected: SelectedBook) => void;
  fetchBooks: (projectId?: string | null) => Promise<void>;
  uploadPdf: (file: File, title?: string, projectId?: string | null) => Promise<BookRecord>;
  removeBook: (id: string, projectId?: string | null) => Promise<void>;
  projectBooks: (projectId?: string | null) => BookRecord[];
  selectedBookId: () => string | null;
  selectedBookIds: (projectId?: string | null) => string[];
  selectedLabel: () => string;
};

export const useBookStore = create<BookState>()(
  persist(
    (set, get) => ({
      books: [],
      projectBookIds: {},
      selected: { kind: "default" },
      loading: false,
      uploading: false,
      error: null,

      setSelected: (selected) => set({ selected, error: null }),

      selectedBookId: () => {
        const { selected } = get();
        return selected.kind === "user" ? selected.id : null;
      },

      projectBooks: (projectId) => {
        const { books, projectBookIds } = get();
        if (!projectId) return books;
        const ids = projectBookIds[projectId] ?? [];
        const idSet = new Set(ids);
        return books.filter((book) => idSet.has(book.id));
      },

      selectedBookIds: (projectId) => {
        const { selected } = get();
        if (selected.kind === "user") return get().projectBooks(projectId).filter((book) => book.id === selected.id && book.status === "ready").map((book) => book.id);
        return get()
          .projectBooks(projectId)
          .filter((book) => book.status === "ready")
          .map((book) => book.id);
      },

      selectedLabel: () => {
        const { selected, books } = get();
        if (selected.kind === "default") {
          const readyCount = books.filter((book) => book.status === "ready").length;
          return readyCount > 0 ? `${readyCount} project sources` : "ReszVault";
        }
        return books.find((b) => b.id === selected.id)?.title ?? "My book";
      },

      fetchBooks: async () => {
        set({ loading: true, error: null });
        try {
          const books = await listBooks();
          const { selected, projectBookIds } = get();
          // Older installations had no project mapping. Adopt those sources into
          // the original vault, never whichever project happens to be open.
          const assigned = new Set(Object.values(projectBookIds).flat());
          const unassigned = books.filter((book) => !assigned.has(book.id)).map((book) => book.id);
          const nextProjectBookIds = unassigned.length
            ? { ...projectBookIds, "default-research-vault": [...(projectBookIds["default-research-vault"] ?? []), ...unassigned] }
            : projectBookIds;
          if (selected.kind === "user" && !books.some((b) => b.id === selected.id)) {
            set({ books, projectBookIds: nextProjectBookIds, selected: { kind: "default" } });
          } else {
            set({ books, projectBookIds: nextProjectBookIds });
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

      uploadPdf: async (file, title, projectId) => {
        set({ uploading: true, error: null });
        try {
          const book = await uploadBook(file, title);
          set((state) => ({
            books: [book, ...state.books.filter((b) => b.id !== book.id)],
            projectBookIds: projectId
              ? {
                  ...state.projectBookIds,
                  [projectId]: [
                    book.id,
                    ...(state.projectBookIds[projectId] ?? []).filter((id) => id !== book.id),
                  ],
                }
              : state.projectBookIds,
            selected: { kind: "default" },
            uploading: book.status === "processing",
          }));

          if (book.status === "processing") {
            const poll = async (attempts = 0): Promise<BookRecord> => {
              if (attempts > 40) throw new Error("Indexing timed out — try a smaller PDF.");
              await new Promise((r) => setTimeout(r, 3000));

              // Use direct book lookup for the first 5 polls (faster, handles transient DB misses)
              let updated: BookRecord | undefined;
              if (attempts < 5) {
                const found = await getBook(book.id).catch(() => null);
                if (found) updated = found;
              }
              // Fall back to full list
              if (!updated) {
                const books = await listBooks();
                updated = books.find((b) => b.id === book.id);
              }

              if (!updated) {
                // Allow a few transient misses (Render warm-up, DB commit delay)
                if (attempts < 5) return poll(attempts + 1);
                throw new Error("Upload lost — try again.");
              }

              set((state) => ({
                books: [
                  updated!,
                  ...state.books.filter((b) => b.id !== updated!.id),
                ],
                projectBookIds: projectId
                  ? {
                      ...state.projectBookIds,
                      [projectId]: [
                        book.id,
                        ...(state.projectBookIds[projectId] ?? []).filter((id) => id !== book.id),
                      ],
                    }
                  : state.projectBookIds,
              }));
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
          projectBookIds: Object.fromEntries(
            Object.entries(state.projectBookIds).map(([key, ids]) => [
              key,
              ids.filter((bookId) => bookId !== id),
            ]),
          ),
          selected: selected.kind === "user" && selected.id === id ? { kind: "default" } : selected,
        }));
      },
    }),
    {
      name: "reszvault-books",
      version: 2,
      partialize: (state) => ({
        selected: state.selected,
        projectBookIds: state.projectBookIds,
      }),
      migrate: (persisted) => {
        const state = persisted as Partial<BookState> | undefined;
        return {
          selected: state?.selected ?? { kind: "default" },
          projectBookIds: state?.projectBookIds ?? {},
        };
      },
    },
  ),
);
