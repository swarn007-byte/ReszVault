import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WorkspaceFrame, PageHeader } from "./WorkspaceFrame";
import { Icon } from "../Icon";
import { EmptyState } from "../EmptyState/EmptyState";
import { ChatWindow } from "../ChatWindow/ChatWindow";
import { BookPicker } from "../Sidebar/BookPicker";
import { PdfPreview } from "../PdfPreview";
import { useChatStore } from "../../store/chatStore";
import { useBookStore } from "../../store/bookStore";
import { useProjectStore } from "../../store/projectStore";
import { useEditorStore } from "../../store/editorStore";
import { streamQuestion } from "../../api/chat";
import type { BookRecord } from "../../api/books";
import { exportVault } from "../../lib/export-vault";

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const [params, setParams] = useSearchParams();
  const {
    chats,
    isSending,
    createChat,
    addMessage,
    appendToMessage,
    setMessageContent,
    setMessageSources,
    setIsSending,
    setActiveChat,
    deleteChat,
  } = useChatStore();
  const project = useProjectStore((state) => state.activeProject())!;
  const updateProject = useProjectStore((state) => state.updateProject);
  const { books, projectBookIds, selected, fetchBooks, uploading, uploadPdf } =
    useBookStore();
  const editor = useEditorStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<BookRecord | null>(null);
  const [notePreview, setNotePreview] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(
    () => window.matchMedia("(min-width: 1101px)").matches,
  );
  const [toast, setToast] = useState("");
  const tab = ["notes", "sources"].includes(params.get("tab") ?? "")
    ? params.get("tab")!
    : "chat";
  const base = location.pathname.startsWith("/guest") ? "/guest" : "/app";
  const scopedBooks = books.filter((book) =>
    (projectBookIds[project.id] ?? []).includes(book.id),
  );
  const readyBooks = scopedBooks.filter((book) => book.status === "ready");
  const processing = scopedBooks.filter((book) => book.status === "processing");
  const activeChat = chats.find(
    (chat) => chat.id === id && chat.projectId === project.id,
  );
  const selectedIds =
    selected.kind === "user" &&
    readyBooks.some((book) => book.id === selected.id)
      ? [selected.id]
      : readyBooks.map((book) => book.id);
  const notes = project.notes ?? "";
  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0;
  const blocked = isSending || uploading || processing.length > 0;
  const placeholder = processing.length
    ? "Your sources are indexing…"
    : !readyBooks.length
      ? "Upload a PDF to start asking questions…"
      : "Ask anything about your sources…";
  const notice = processing.length
    ? {
        title: "Making room for new ideas",
        detail: `Indexing ${processing.length} PDF${processing.length === 1 ? "" : "s"}. Chat will be ready when indexing finishes.`,
      }
    : null;
  const setTab = (next: string) =>
    setParams(next === "chat" ? {} : { tab: next });
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  useEffect(() => {
    void fetchBooks(project.id);
  }, [project.id, fetchBooks]);
  useEffect(() => {
    if (!processing.length) return;
    const timer = window.setInterval(() => {
      void fetchBooks(project.id);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [processing.length, fetchBooks, project.id]);
  useEffect(() => {
    setActiveChat(activeChat?.id ?? null);
  }, [activeChat?.id, setActiveChat]);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1101px)");
    const resize = (event: MediaQueryListEvent) =>
      setDetailsOpen(event.matches);
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);

  const uploadFiles = async (files: File[]) => {
    if (uploading) return;
    if (files.some((file) => !file.name.toLowerCase().endsWith(".pdf"))) {
      useBookStore.setState({ error: "Please choose PDF documents." });
      return;
    }
    for (const file of files) {
      try {
        await uploadPdf(file, undefined, project.id);
      } catch {
        break;
      }
    }
  };
  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void uploadFiles(files);
  };
  const send = async (text: string) => {
    if (blocked || !selectedIds.length) return;
    const chatId = activeChat?.id ?? createChat(project.id);
    if (!activeChat) navigate(`${base}/${chatId}`, { replace: true });
    addMessage(chatId, { role: "user", content: text });
    const assistantId = addMessage(chatId, { role: "assistant", content: "" });
    const abort = new AbortController();
    controller.current = abort;
    setIsSending(true);
    let received = false;
    try {
      await streamQuestion(
        text,
        {
          onToken: (token) => {
            received = true;
            appendToMessage(chatId, assistantId, token);
          },
          onReplace: (answer) => setMessageContent(chatId, assistantId, answer),
          onDone: (meta) => {
            if (meta.answer)
              setMessageContent(chatId, assistantId, meta.answer);
            setMessageSources(chatId, assistantId, meta.sourcesUsed);
          },
          onError: (message) => setMessageContent(chatId, assistantId, message),
        },
        { bookIds: selectedIds, signal: abort.signal },
      );
      if (abort.signal.aborted && !received)
        setMessageContent(
          chatId,
          assistantId,
          "Response stopped. You can ask again whenever you're ready.",
        );
    } finally {
      setIsSending(false);
      controller.current = null;
    }
  };
  const saveAnswer = (text: string) => {
    updateProject(project.id, {
      notes: [notes.trim(), `## Research insight\n\n${text}`]
        .filter(Boolean)
        .join("\n\n"),
    });
    setTab("notes");
    notify("Added to your notebook");
  };
  const format = (kind: string) => {
    const input = noteInput.current;
    const start = input?.selectionStart ?? notes.length;
    const end = input?.selectionEnd ?? notes.length;
    const text = notes.slice(start, end);
    const inserted =
      kind === "bold"
        ? `**${text || "bold text"}**`
        : kind === "italic"
          ? `_${text || "italic text"}_`
          : `\n${(text || "List item")
              .split("\n")
              .map((line) => `- ${line}`)
              .join("\n")}`;
    updateProject(project.id, {
      notes: notes.slice(0, start) + inserted + notes.slice(end),
    });
    setNotePreview(false);
    requestAnimationFrame(() => {
      noteInput.current?.focus();
      noteInput.current?.setSelectionRange(start, start + inserted.length);
    });
  };
  const download = () => {
    exportVault(project);
    notify("Vault exported as Markdown");
  };
  const sourceTools = (
    <>
      <BookPicker
        projectId={project.id}
        onUpload={() => fileInput.current?.click()}
        onPreview={setPreview}
      />
      <section className="detail-section">
        <h3>Vault details</h3>
        <dl className="properties">
          <div>
            <dt>Indexed sources</dt>
            <dd>{readyBooks.length}</dd>
          </div>
          <div>
            <dt>Knowledge chunks</dt>
            <dd>
              {scopedBooks.reduce((sum, book) => sum + book.chunkCount, 0)}
            </dd>
          </div>
          <div>
            <dt>Notebook</dt>
            <dd>{words} words</dd>
          </div>
        </dl>
        <div className="grounded-note">
          <Icon name="sparkle" size={16} />
          <span>Answers are drawn from the sources in this vault.</span>
        </div>
      </section>
    </>
  );
  const noteTools = (
    <>
      <section>
        <h3>Paper style</h3>
        <p className="details-copy">A little room to make it yours.</p>
        <div className="paper-swatches">
          {["paper", "blue", "sage", "sand", "lilac"].map((paper) => (
            <button
              key={paper}
              className={`paper-swatch ${paper} ${editor.paper === paper ? "selected" : ""}`}
              aria-label={`${paper} paper`}
              aria-pressed={editor.paper === paper}
              onClick={() => editor.update({ paper })}
            >
              Aa
              {editor.paper === paper && (
                <span>
                  <Icon name="check" size={10} />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
      <section className="detail-section">
        <h3>Text editor</h3>
        <label className="font-picker">
          <span>Aa</span>
          <small>Font family</small>
          <select
            aria-label="Notebook font"
            value={editor.font}
            onChange={(event) => editor.update({ font: event.target.value })}
          >
            <option value="serif">Editorial serif</option>
            <option value="sans">Clean sans</option>
            <option value="mono">Monospace</option>
          </select>
        </label>
        <div className="editor-tools">
          {[
            ["bold", "Bold"],
            ["italic", "Italic"],
            ["list", "List"],
          ].map(([icon, label]) => (
            <button key={icon} onClick={() => format(icon)}>
              <span>
                <Icon name={icon} size={18} />
              </span>
              {label}
            </button>
          ))}
        </div>
        <div className="font-size-control">
          <span>Text size</span>
          <div>
            <button
              aria-label="Decrease text size"
              disabled={editor.fontSize <= 14}
              onClick={() =>
                editor.update({ fontSize: Math.max(14, editor.fontSize - 1) })
              }
            >
              −
            </button>
            <span>{editor.fontSize}</span>
            <button
              aria-label="Increase text size"
              disabled={editor.fontSize >= 24}
              onClick={() =>
                editor.update({ fontSize: Math.min(24, editor.fontSize + 1) })
              }
            >
              +
            </button>
          </div>
        </div>
      </section>
      <section className="detail-section">
        <h3>On this page</h3>
        <dl className="properties">
          <div>
            <dt>Words</dt>
            <dd>{words}</dd>
          </div>
          <div>
            <dt>Characters</dt>
            <dd>{notes.length}</dd>
          </div>
        </dl>
        <p className="saved-note">
          <Icon name="check" size={13} />
          Saved on this device
        </p>
      </section>
    </>
  );

  return (
    <WorkspaceFrame
      className="vault-workspace"
      aside={
        <>
          {detailsOpen && (
            <button
              className="details-backdrop"
              onClick={() => setDetailsOpen(false)}
              aria-label="Close details"
            />
          )}
          <aside
            className={`details-panel vault-details ${detailsOpen ? "is-open" : "is-collapsed"}`}
          >
            <div className="details-heading">
              <h2>{tab === "notes" ? "Make it your own" : "Your context"}</h2>
              <button
                className="icon-button"
                aria-label="Hide details"
                onClick={() => setDetailsOpen(false)}
              >
                <Icon name="panel" size={17} />
              </button>
            </div>
            <div className="details-body">
              {tab === "notes" ? noteTools : sourceTools}
            </div>
            <div className="details-footer">
              <button onClick={download}>
                <Icon name="download" size={17} />
                Export vault
                <Icon name="arrow" size={14} />
              </button>
              <span className="footer-caption">Take your ideas anywhere.</span>
            </div>
          </aside>
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="visually-hidden"
        aria-label="Upload PDF documents"
        onChange={chooseFiles}
      />
      <PageHeader
        title={project.name}
        actions={
          <>
            <button className="header-export" onClick={download}>
              <Icon name="download" size={15} />
              <span>Export</span>
            </button>
            <button
              className="icon-button details-toggle"
              onClick={() => setDetailsOpen((value) => !value)}
              aria-label="Show details"
              aria-expanded={detailsOpen}
            >
              <Icon name="panel" />
            </button>
          </>
        }
      />
      <div className="vault-heading">
        <div>
          <span className="eyebrow">YOUR RESEARCH, CONNECTED</span>
          <h1>{project.name}</h1>
          <p>{project.description}</p>
        </div>
        <button
          className={`icon-button pin-vault ${project.pinned ? "selected" : ""}`}
          aria-label={project.pinned ? "Unpin vault" : "Pin vault"}
          aria-pressed={Boolean(project.pinned)}
          onClick={() => updateProject(project.id, { pinned: !project.pinned })}
        >
          <Icon name="pin" size={17} />
        </button>
      </div>
      <div className="vault-tabbar">
        <nav className="workspace-tabs" aria-label="Vault sections">
          {[
            ["chat", "chat", "Ask sources"],
            ["notes", "note", "Notebook"],
            ["sources", "file", "Sources"],
          ].map(([value, icon, label]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              aria-current={tab === value ? "page" : undefined}
              onClick={() => setTab(value)}
            >
              <Icon name={icon} size={16} />
              {label}
              {value === "sources" && <small>{scopedBooks.length}</small>}
            </button>
          ))}
        </nav>
        <span className="vault-save-state">
          <span className="status-dot" />
          {processing.length ? "Indexing sources" : "Private vault"}
        </span>
      </div>
      <div
        className={`vault-content ${tab === "notes" ? "notebook-content" : ""}`}
      >
        {tab === "chat" &&
          (activeChat?.messages.length ? (
            <>
              <div className="conversation-heading">
                <span>{activeChat.title}</span>
                <button
                  className="icon-button"
                  aria-label="Delete conversation"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this conversation? Your sources and notebook will be kept.",
                      )
                    ) {
                      deleteChat(activeChat.id);
                      navigate(base);
                    }
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <ChatWindow
                chat={activeChat}
                onSend={(text) => void send(text)}
                onSave={saveAnswer}
                onStop={() => controller.current?.abort()}
                isSending={isSending}
                disabled={blocked || !readyBooks.length}
                placeholder={placeholder}
                statusNotice={notice}
                streamingMessageId={
                  isSending ? activeChat.messages.at(-1)?.id : undefined
                }
              />
            </>
          ) : (
            <EmptyState
              onSend={(text) => void send(text)}
              onUpload={() => fileInput.current?.click()}
              sourceCount={readyBooks.length}
              disabled={blocked}
              placeholder={placeholder}
              statusNotice={notice}
            />
          ))}
        {tab === "notes" && (
          <>
            <div className="notebook-toolbar">
              <span>
                <Icon name="note" size={15} />
                Research notes
              </span>
              <div>
                <span className="note-save">
                  <Icon name="check" size={12} />
                  Saved
                </span>
                <button
                  className={`button subtle ${notePreview ? "selected" : ""}`}
                  onClick={() => setNotePreview((value) => !value)}
                >
                  <Icon name={notePreview ? "note" : "eye"} size={14} />
                  {notePreview ? "Edit" : "Preview"}
                </button>
              </div>
            </div>
            <div className="notebook-scroll">
              <article
                className={`note-paper ${editor.paper} font-${editor.font}`}
                style={{ fontSize: editor.fontSize }}
              >
                <span className="note-date">
                  {new Date(project.createdAt).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <h2>{project.name}</h2>
                <div className="note-rule" />
                {notePreview ? (
                  <div className="markdown note-preview">
                    {notes.trim() ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {notes}
                      </ReactMarkdown>
                    ) : (
                      <p className="muted">
                        Your thoughts will find a home here.
                      </p>
                    )}
                  </div>
                ) : (
                  <textarea
                    ref={noteInput}
                    className="note-editor"
                    aria-label="Research notes"
                    value={notes}
                    onChange={(event) =>
                      updateProject(project.id, { notes: event.target.value })
                    }
                    placeholder={
                      "Start with a thought.\n\nCapture what matters, connect your ideas, or save an answer from your sources."
                    }
                  />
                )}
                <footer className="paper-footer">
                  <span>{words} words</span>
                  <span>YOUR PERSONAL NOTEBOOK</span>
                </footer>
              </article>
            </div>
          </>
        )}
        {tab === "sources" && (
          <div className="source-library">
            <div className="section-label">
              <div>
                <h2>A foundation for your ideas.</h2>
                <p>
                  {scopedBooks.length} document
                  {scopedBooks.length === 1 ? "" : "s"} in this vault
                </p>
              </div>
              <button
                className="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                <Icon name="plus" size={16} />
                Add PDFs
              </button>
            </div>
            <button
              className="drop-zone"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void uploadFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <span className="soft-icon">
                <Icon name="upload" size={24} />
              </span>
              <strong>
                {uploading
                  ? "Preparing your source…"
                  : "Drop your documents here"}
              </strong>
              <span>or click to browse · PDF documents</span>
            </button>
            <div className="library-source-list">
              {scopedBooks.map((book) => (
                <button key={book.id} onClick={() => setPreview(book)}>
                  <span className="pdf-icon">
                    <Icon name="file" size={22} />
                  </span>
                  <span>
                    <strong>{book.title}</strong>
                    <small>
                      {book.filename} · {book.chunkCount} chunks
                    </small>
                  </span>
                  <span className={`source-status ${book.status}`}>
                    <i />
                    {book.status === "ready"
                      ? "Indexed"
                      : book.status === "failed"
                        ? "Failed"
                        : "Indexing"}
                  </span>
                  <Icon name="eye" size={17} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {preview && (
        <PdfPreview book={preview} onClose={() => setPreview(null)} />
      )}
      <div className={`toast ${toast ? "visible" : ""}`} role="status">
        {toast && (
          <>
            <Icon name="check" size={16} />
            {toast}
          </>
        )}
      </div>
    </WorkspaceFrame>
  );
}
