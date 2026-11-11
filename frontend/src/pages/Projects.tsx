import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProjectStore } from "../store/projectStore";
import { useBookStore } from "../store/bookStore";
import { useChatStore } from "../store/chatStore";
import {
  WorkspaceFrame,
  PageHeader,
} from "../components/layout/WorkspaceFrame";
import { Icon } from "../components/Icon";
import { CreateVault } from "../components/CreateVault";
import { exportVault } from "../lib/export-vault";

export function ProjectsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { projects, activeProjectId, selectProject, updateProject } =
    useProjectStore();
  const { books, projectBookIds, fetchBooks, error } = useBookStore();
  const chats = useChatStore((state) => state.chats);
  const [query, setQuery] = useState("");
  const [listView, setListView] = useState(false);
  const [sortByName, setSortByName] = useState(false);
  const [exported, setExported] = useState(false);
  const view = params.get("view");
  const focused =
    projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const visible = useMemo(
    () =>
      projects
        .filter((project) => {
          return (
            `${project.name} ${project.description}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (view !== "pinned" || project.pinned) &&
            (view !== "notes" || project.notes?.trim())
          );
        })
        .sort((a, b) =>
          sortByName
            ? a.name.localeCompare(b.name)
            : Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
              b.updatedAt.localeCompare(a.updatedAt),
        ),
    [projects, query, view, sortByName],
  );
  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);
  const projectSources = (id: string) =>
    books.filter((book) => (projectBookIds[id] ?? []).includes(book.id));
  const projectChats = (id: string) =>
    chats.filter((chat) => chat.projectId === id && chat.messages.length);
  const open = (id: string, tab?: string) => {
    selectProject(id);
    navigate(`${user ? "/app" : "/guest"}${tab ? `?tab=${tab}` : ""}`);
  };
  const setView = (next: string) => setParams(next ? { view: next } : {});
  const title =
    view === "pinned"
      ? "Pinned vaults"
      : view === "notes"
        ? "Your notebooks"
        : "Your vaults";
  const focusedSources = focused ? projectSources(focused.id) : [];
  const completed = focusedSources.filter(
    (book) => book.status === "ready",
  ).length;
  const recent = [...projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);
  const download = () => {
    if (focused) {
      exportVault(focused);
      setExported(true);
      setTimeout(() => setExported(false), 2200);
    }
  };

  return (
    <WorkspaceFrame
      className="dashboard"
      aside={
        <aside className="details-panel dashboard-details">
          <div className="details-heading">
            <h2>Workspace overview</h2>
            <Icon name="panel" size={17} />
          </div>
          <div className="details-body">
            <div className="overview-illustration">
              <span />
              <span />
              <span />
              <Icon name="folder" size={30} />
            </div>
            <h3 className="overview-title">A little more organized.</h3>
            <p className="details-copy">
              Your sources, conversations, and ideas. All in their own place.
            </p>
            <div className="metric-card">
              <div>
                <span>Documents</span>
                <Icon name="file" size={16} />
              </div>
              <strong>
                {books.length.toLocaleString()}{" "}
                <small>PDF{books.length === 1 ? "" : "s"}</small>
              </strong>
              <div className="metric-track">
                <span
                  style={{
                    width: books.length
                      ? `${(books.filter((book) => book.status === "ready").length / books.length) * 100}%`
                      : "0%",
                  }}
                />
              </div>
              <small>
                {books.filter((book) => book.status === "ready").length} indexed
                and ready
              </small>
            </div>
            <div className="metric-card">
              <div>
                <span>Conversations</span>
                <Icon name="chat" size={16} />
              </div>
              <strong>
                {chats.filter((chat) => chat.messages.length).length}{" "}
                <small>saved</small>
              </strong>
              <div className="metric-dots">
                {Array.from({ length: 18 }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i < chats.filter((chat) => chat.messages.length).length
                        ? "filled"
                        : ""
                    }
                  />
                ))}
              </div>
            </div>
            {focused && (
              <section className="detail-section">
                <div className="section-label">
                  <h3>Selected vault</h3>
                  <span className={`vault-dot ${focused.color ?? "blue"}`} />
                </div>
                <h4>{focused.name}</h4>
                <p className="details-copy">{focused.description}</p>
                <dl className="properties">
                  <div>
                    <dt>Sources</dt>
                    <dd>{focusedSources.length}</dd>
                  </div>
                  <div>
                    <dt>Indexed chunks</dt>
                    <dd>
                      {focusedSources.reduce(
                        (sum, book) => sum + book.chunkCount,
                        0,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Conversations</dt>
                    <dd>{projectChats(focused.id).length}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>
                      {new Date(focused.updatedAt).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="tag-row">
                  <span className="tag">
                    <span className="status-dot" />
                    {completed ? "Ready to research" : "Ready for sources"}
                  </span>
                  <span className="tag">Private vault</span>
                </div>
              </section>
            )}
          </div>
          <div className="details-footer">
            {focused && (
              <>
                <button onClick={() => open(focused.id, "notes")}>
                  <Icon name="note" size={17} /> Open notebook{" "}
                  <Icon name="arrow" size={14} />
                </button>
                <button onClick={download}>
                  <Icon name="download" size={17} />
                  <span role="status">
                    {exported ? "Markdown exported" : "Export vault"}
                  </span>
                </button>
              </>
            )}
            <span className="footer-caption">
              A clear space for a curious mind.
            </span>
          </div>
        </aside>
      }
    >
      <PageHeader
        title="Vaults"
        actions={
          <>
            <span className="header-status">
              <span className="status-dot" /> Personal workspace
            </span>
            <button
              className="icon-button"
              onClick={() => navigate("/settings")}
              aria-label="Workspace settings"
            >
              <Icon name="settings" />
            </button>
          </>
        }
      />
      <div className="dashboard-scroll">
        <div className="dashboard-content">
          <div className="page-title-row">
            <div>
              <span className="eyebrow">A PLACE FOR YOUR IDEAS</span>
              <h1>
                {title}
                <span className="title-dot">.</span>
              </h1>
              <p>Less searching. More connecting the dots.</p>
            </div>
            <button
              className="button primary"
              onClick={() => setParams({ create: "1" })}
            >
              <Icon name="plus" size={16} /> New vault
            </button>
          </div>
          <div className="dashboard-toolbar">
            <div className="view-tabs" aria-label="Vault filters">
              {[
                ["", "All vaults"],
                ["pinned", "Pinned"],
                ["notes", "With notes"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={(view ?? "") === value ? "active" : ""}
                  onClick={() => setView(value)}
                >
                  {label}
                  {!value && <small>{projects.length}</small>}
                </button>
              ))}
            </div>
            <div className="view-controls">
              <button
                className={`icon-button ${!listView ? "selected" : ""}`}
                onClick={() => setListView(false)}
                aria-label="Grid view"
                aria-pressed={!listView}
              >
                <Icon name="grid" size={16} />
              </button>
              <button
                className={`icon-button ${listView ? "selected" : ""}`}
                onClick={() => setListView(true)}
                aria-label="List view"
                aria-pressed={listView}
              >
                <Icon name="list" size={17} />
              </button>
            </div>
          </div>
          <div className="search-row">
            <label className="search-field">
              <Icon name="search" size={17} />
              <input
                aria-label="Search vaults"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your vaults…"
              />
              {query && (
                <button
                  className="icon-button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </label>
            <button
              className="button subtle sort-button"
              onClick={() => setSortByName((value) => !value)}
            >
              <Icon name="sort" size={15} />
              {sortByName ? "Name A–Z" : "Last updated"}
            </button>
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error} <button onClick={() => void fetchBooks()}>Retry</button>
            </div>
          )}
          <div
            className={`folder-grid ${listView ? "list-view" : ""}`}
            aria-label="Vaults"
          >
            {visible.map((project) => (
              <article
                key={project.id}
                className={`folder-item ${project.color ?? "blue"} ${focused?.id === project.id ? "is-active" : ""}`}
              >
                <button
                  className="folder-card"
                  onClick={() => open(project.id)}
                  aria-label={`Open ${project.name}`}
                >
                  <span className="folder-art">
                    <span className="folder-back" />
                    <span className="folder-paper paper-back" />
                    <span className="folder-paper paper-front">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="folder-front">
                      <span className="folder-monogram">
                        <Icon name="folder" size={21} />
                      </span>
                    </span>
                  </span>
                  <span className="folder-information">
                    <strong>{project.name}</strong>
                    <span>
                      {projectSources(project.id).length} sources <b>·</b>{" "}
                      {projectChats(project.id).length} conversations
                    </span>
                    <small>{project.description}</small>
                  </span>
                  <span className="folder-bottom">
                    <span>
                      Updated{" "}
                      {new Date(project.updatedAt).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </span>
                    <Icon name="arrow" size={15} />
                  </span>
                </button>
                <button
                  className={`folder-pin ${project.pinned ? "is-pinned" : ""}`}
                  aria-label={`${project.pinned ? "Unpin" : "Pin"} ${project.name}`}
                  aria-pressed={Boolean(project.pinned)}
                  onClick={() =>
                    updateProject(project.id, { pinned: !project.pinned })
                  }
                >
                  <Icon name="pin" size={16} />
                </button>
              </article>
            ))}
            {!query && !view && (
              <button
                className="new-folder"
                onClick={() => setParams({ create: "1" })}
              >
                <span>
                  <Icon name="plus" size={23} />
                </span>
                <strong>Room for a new idea</strong>
                <small>Create a vault</small>
              </button>
            )}
          </div>
          {visible.length === 0 && (
            <div className="search-empty">
              <Icon
                name={
                  view === "pinned"
                    ? "pin"
                    : view === "notes"
                      ? "note"
                      : "search"
                }
                size={30}
              />
              <h3>
                {query
                  ? "No matching vaults"
                  : view === "pinned"
                    ? "Keep your favorites close."
                    : "Your next thought starts here."}
              </h3>
              <p>
                {query
                  ? "Try a different name or description."
                  : view === "pinned"
                    ? "Pin a vault to find it quickly here."
                    : "Open a vault and add your first notebook entry."}
              </p>
              <button
                className="button"
                onClick={() => {
                  setQuery("");
                  setView("");
                }}
              >
                View all vaults
              </button>
            </div>
          )}
          <section className="recent-section">
            <div className="section-label">
              <h2>Pick up where you left off</h2>
              <Icon name="clock" size={17} />
            </div>
            <div className="recent-table">
              {recent.map((project) => (
                <button
                  className="recent-row"
                  key={project.id}
                  onClick={() => open(project.id)}
                >
                  <span className={`recent-icon ${project.color ?? "blue"}`}>
                    <Icon name="folder" size={17} />
                  </span>
                  <div>
                    <strong>{project.name}</strong>
                    <span>
                      {project.notes?.trim()
                        ? `${project.notes.trim().split(/\s+/).length} words in notebook`
                        : "Your research workspace"}
                    </span>
                  </div>
                  <span className="recent-sources">
                    {projectSources(project.id).length} sources
                  </span>
                  <time>
                    {new Date(project.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                  <Icon name="chevron" size={14} />
                </button>
              ))}
            </div>
          </section>
          <div className="workspace-tip">
            <span className="tip-icon">
              <Icon name="sparkle" size={19} />
            </span>
            <div>
              <strong>From a document to your next discovery.</strong>
              <p>
                Upload PDFs, ask questions across your sources, and keep the
                useful parts in your notebook.
              </p>
            </div>
          </div>
          <footer className="canvas-footer">
            <span>Made for your train of thought.</span>
            <span>ReszVault / Personal workspace</span>
          </footer>
        </div>
      </div>
      {params.get("create") === "1" && (
        <CreateVault
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete("create");
            setParams(next);
          }}
        />
      )}
    </WorkspaceFrame>
  );
}
