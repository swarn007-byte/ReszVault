import { useEffect, useRef, useState } from "react";
import { getBookFile, type BookRecord } from "../api/books";
import { Icon } from "./Icon";

export function PdfPreview({
  book,
  onClose,
}: {
  book: BookRecord;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    let active = true;
    let objectUrl = "";
    void getBookFile(book.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (active)
          setError(err instanceof Error ? err.message : "Could not open PDF.");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [book.id]);
  return (
    <dialog
      className="pdf-modal"
      ref={ref}
      onCancel={onClose}
      aria-label={`Preview ${book.title}`}
    >
      <div className="pdf-modal-header">
        <Icon name="file" />
        <strong>{book.title}</strong>
        <button
          className="icon-button"
          aria-label="Close preview"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : url ? (
        <iframe title={book.title} src={url} />
      ) : (
        <div className="preview-loading">
          <span className="spinner" />
          Opening your document…
        </div>
      )}
    </dialog>
  );
}
