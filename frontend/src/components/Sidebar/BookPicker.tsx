import { useBookStore } from "../../store/bookStore";
import type { BookRecord } from "../../api/books";
import { Icon } from "../Icon";

type Props = {
  projectId: string;
  onUpload: () => void;
  onPreview: (book: BookRecord) => void;
};
export function BookPicker({ projectId, onUpload, onPreview }: Props) {
  const {
    books,
    projectBookIds,
    selected,
    setSelected,
    uploading,
    error,
    removeBook,
  } = useBookStore();
  const scoped = books.filter((book) =>
    (projectBookIds[projectId] ?? []).includes(book.id),
  );
  const ready = scoped.filter((book) => book.status === "ready");
  return (
    <div className="source-picker">
      <div className="section-label">
        <h3>Sources</h3>
        <span className="count-badge">{scoped.length}</span>
      </div>
      <p className="details-copy">The context behind every answer.</p>
      <button className="upload-button" onClick={onUpload} disabled={uploading}>
        <Icon name="upload" size={17} />
        {uploading ? "Indexing your PDF…" : "Upload PDFs"}
        <span>PDF</span>
      </button>
      {scoped.length ? (
        <div className="source-list">
          {scoped.map((book) => (
            <div
              key={book.id}
              className={`source-row ${selected.kind === "user" && selected.id === book.id ? "selected" : ""}`}
            >
              <span
                className={`pdf-icon ${book.status === "failed" ? "failed" : ""}`}
              >
                <Icon name="file" size={18} />
              </span>
              <button
                className="source-title"
                onClick={() => onPreview(book)}
                title={`Preview ${book.title}`}
              >
                <strong>{book.title}</strong>
                <small>
                  {book.status === "ready"
                    ? `${book.chunkCount} chunks · Indexed`
                    : book.status === "processing"
                      ? "Indexing…"
                      : "Indexing failed"}
                </small>
              </button>
              <button
                className="icon-button remove-source"
                aria-label={`Remove ${book.title}`}
                onClick={() => {
                  if (window.confirm(`Remove “${book.title}” from this vault?`))
                    void removeBook(book.id, projectId).catch((err: unknown) =>
                      useBookStore.setState({
                        error:
                          err instanceof Error
                            ? err.message
                            : "Could not remove the source.",
                      }),
                    );
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="sources-empty">
          <Icon name="file" size={26} />
          <strong>Your sources live here</strong>
          <span>Add a PDF to start a conversation with your documents.</span>
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {ready.length > 0 && (
        <label className="scope-select">
          Answer from
          <select
            value={
              selected.kind === "user" &&
              ready.some((book) => book.id === selected.id)
                ? selected.id
                : "all"
            }
            onChange={(event) =>
              setSelected(
                event.target.value === "all"
                  ? { kind: "default" }
                  : { kind: "user", id: event.target.value },
              )
            }
          >
            <option value="all">
              All {ready.length} source{ready.length === 1 ? "" : "s"}
            </option>
            {ready.map((book) => (
              <option value={book.id} key={book.id}>
                {book.title}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
