import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useBookStore } from "../../store/bookStore";

type BookPickerProps = {
  projectId?: string | null;
};

export function BookPicker({ projectId }: BookPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(true);
  const {
    loading,
    uploading,
    error,
    books,
    projectBookIds,
    fetchBooks,
    uploadPdf,
    removeBook,
  } = useBookStore();

  useEffect(() => {
    fetchBooks(projectId);
  }, [fetchBooks, projectId]);

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      useBookStore.setState({ error: "Please choose a PDF file." });
      return;
    }
    try {
      await uploadPdf(file, undefined, projectId);
    } catch {
      // error stored in bookStore
    }
  };

  const hasAnyProjectMap = Object.values(projectBookIds).some((bookIds) => bookIds.length > 0);
  const scopedBooks = (() => {
    if (!projectId) return books;
    const ids = projectBookIds[projectId];
    if (!ids && !hasAnyProjectMap) return books;
    if (!ids) return [];
    const idSet = new Set(ids);
    return books.filter((book) => idSet.has(book.id));
  })();
  const readyBooks = scopedBooks.filter((b) => b.status === "ready");
  const processingBooks = scopedBooks.filter((b) => b.status !== "ready");

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-[#e4e6eb] bg-white">
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-[#fafbfc]"
          aria-expanded={isOpen}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#f2f4f7] text-[#6e737d]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5V5a2 2 0 0 1 2-2h8l6 6v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z" />
                <path d="M14 3v6h6" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[#2f333d]">Sources</span>
              <span className="mt-0.5 block text-[10px] text-[#8b909a]">
                {readyBooks.length} indexed PDF{readyBooks.length === 1 ? "" : "s"}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-[#eef1f5] px-2 py-0.5 text-[10px] font-semibold text-[#6e737d]">
              {readyBooks.length}
            </span>
            <svg
              className={`h-4 w-4 text-[#8b909a] transition-transform ${isOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>

        {isOpen && (
          <div className="border-t border-[#eef0f4] px-2.5 py-2.5">
            {readyBooks.length === 0 && !loading && (
              <p className="rounded-lg bg-[#f7f8fa] px-3 py-2.5 text-[11px] leading-relaxed text-[#8b909a]">
                Upload PDFs to add context to this project.
              </p>
            )}

            {readyBooks.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {readyBooks.map((book) => (
              <div
                key={book.id}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[#f7f8fa]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#e7eaf0] bg-white text-[#7d8490]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-[#3f444f]">
                    {book.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[#9aa0aa]">
                    {book.chunkCount} chunks
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeBook(book.id, projectId).catch(() => {})}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#9aa0aa] opacity-0 transition hover:bg-white hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Remove ${book.title}`}
                  title={`Remove ${book.title}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
            )}

            {processingBooks.length > 0 && (
              <div className="mt-2 space-y-1">
                {processingBooks.map((book) => (
                  <div key={book.id} className="truncate rounded-lg bg-[#fafbfc] px-2.5 py-2 text-[11px] text-[#8b909a]">
                    {book.title} ({book.status})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="flex min-w-0 w-full items-center justify-center gap-2 rounded-xl border border-[#e4e6eb] bg-[#fbfbfc] py-2.5 text-xs font-semibold text-[#6e737d] transition-colors hover:bg-[#f3f5f8] disabled:opacity-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {uploading ? "Indexing..." : "Upload PDF"}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={onFileChange}
      />

      {loading && scopedBooks.length === 0 && (
        <p className="text-[11px] text-[#8b909a]">Loading...</p>
      )}

      {error && !error.toLowerCase().includes("request failed") && (
        <p className="text-[11px] leading-relaxed text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
