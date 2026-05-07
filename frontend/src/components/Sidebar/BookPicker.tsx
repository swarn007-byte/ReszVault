import { useEffect, useRef, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useBookStore } from "../../store/bookStore";

export function BookPicker() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated } = useAuth();
  const {
    books,
    selected,
    loading,
    uploading,
    error,
    setSelected,
    fetchBooks,
    uploadPdf,
    removeBook,
    selectedLabel,
  } = useBookStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchBooks();
    } else {
      useBookStore.setState({
        books: [],
        error: null,
        selected: { kind: "default" },
      });
    }
  }, [isAuthenticated, fetchBooks]);

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      useBookStore.setState({ error: "Please choose a PDF file." });
      return;
    }
    try {
      await uploadPdf(file);
    } catch {
      // error stored in bookStore
    }
  };

  const onSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "default") {
      setSelected({ kind: "default" });
      return;
    }
    setSelected({ kind: "user", id: value });
  };

  const selectValue = selected.kind === "default" ? "default" : selected.id;
  const readyBooks = books.filter((b) => b.status === "ready");

  if (!isAuthenticated) {
    return (
      <div className="rounded-lg border border-[rgba(255, 255, 255, 0.08)] bg-[#0b0c0f] px-3 py-3">
        <p className="text-[10px] uppercase tracking-widest text-[#7a7875]">
          Active source
        </p>
        <p className="mt-1 text-xs text-[#e8e6e1]">Default notebook</p>
        <p className="mt-1 text-[11px] text-[#7a7875]">
          Sign in to upload and query your PDFs.
        </p>
        <Link
          to="/login"
          className="mt-3 flex w-full items-center justify-center rounded-md border border-[rgba(255, 255, 255, 0.08)] bg-[#222222] py-2 text-[11px] font-semibold text-[#e8e6e1] transition-colors hover:border-[#c87c5a]/40 hover:text-[#c87c5a]"
        >
          Sign in for uploads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-[rgba(255, 255, 255, 0.08)] bg-[#0b0c0f] p-3">
      <label
        htmlFor="active-book"
        className="block text-[10px] uppercase tracking-widest text-[#7a7875]"
      >
        Active source
      </label>

      <select
        id="active-book"
        value={selectValue}
        onChange={onSelectChange}
        className="w-full rounded-md border border-[rgba(255, 255, 255, 0.08)] bg-[#222222] px-2.5 py-2 text-xs text-[#e8e6e1] focus:border-[#c87c5a]/50 focus:outline-none"
      >
        <option value="default">ReszVault workspace</option>
        {readyBooks.map((book) => (
          <option key={book.id} value={book.id}>
            {book.title}
          </option>
        ))}
        {books
          .filter((b) => b.status !== "ready")
          .map((book) => (
            <option key={book.id} value={book.id} disabled>
              {book.title} ({book.status})
            </option>
          ))}
      </select>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="min-w-0 flex-1 rounded-md border border-dashed border-[rgba(255, 255, 255, 0.13)] py-2 text-[11px] text-[#7a7875] transition-colors hover:border-[#c87c5a]/40 hover:text-[#e8e6e1] disabled:opacity-50"
        >
          {uploading ? "Indexing PDF..." : "+ Add PDF"}
        </button>
        {selected.kind === "user" && (
          <button
            type="button"
            onClick={() => removeBook(selected.id).catch(() => {})}
            className="shrink-0 rounded-md border border-[rgba(255, 255, 255, 0.13)] px-2.5 py-2 text-[11px] text-[#7a7875] hover:border-red-300 hover:text-red-500"
            aria-label={`Remove ${selectedLabel()}`}
          >
            Remove
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={onFileChange}
      />

      {loading && books.length === 0 && (
        <p className="text-[11px] text-[#7a7875]">Loading your books...</p>
      )}

      {error && (
        <p className="text-[11px] leading-relaxed text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
