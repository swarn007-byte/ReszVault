import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BookRecord } from "../api/books";
import { deleteBook, listBooks, uploadBook } from "../api/books";

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
        const ids = projectBookIds[projectId];
        const hasAnyProjectMap = Object.values(projectBookIds).some((bookIds) => bookIds.length > 0);
        if (!ids && !hasAnyProjectMap) return books;
        if (!ids) return [];
        const idSet = new Set(ids);
        return books.filter((book) => idSet.has(book.id));
      },

      selectedBookIds: (projectId) => {
        const { selected } = get();
        if (selected.kind === "user") return [selected.id];
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

      fetchBooks: async (projectId) => {
        set({ loading: true, error: null });
        try {
          const books = await listBooks();
          const { selected, projectBookIds } = get();
          const liveIds = new Set(books.map((book) => book.id));
          const currentProjectIds = projectId ? projectBookIds[projectId] : undefined;
          const currentProjectHasLiveBooks = Boolean(
            currentProjectIds?.some((bookId) => liveIds.has(bookId)),
          );
          const hasAnyProjectMap = Object.values(projectBookIds).some((bookIds) => bookIds.length > 0);
          const nextProjectBookIds =
            projectId && books.length > 0 && (!hasAnyProjectMap || (currentProjectIds && !currentProjectHasLiveBooks))
              ? { ...projectBookIds, [projectId]: books.map((book) => book.id) }
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
              const books = await listBooks();
              const updated = books.find((b) => b.id === book.id);
              if (!updated) throw new Error("Upload lost — try again.");
              set((state) => ({
                books,
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

      removeBook: async (id, projectId) => {
        await deleteBook(id);
        const { selected } = get();
        set((state) => ({
          books: state.books.filter((b) => b.id !== id),
          projectBookIds: Object.fromEntries(
            Object.entries(state.projectBookIds).map(([key, ids]) => [
              key,
              key === projectId || !projectId ? ids.filter((bookId) => bookId !== id) : ids,
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
