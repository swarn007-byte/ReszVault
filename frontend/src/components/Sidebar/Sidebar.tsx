import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useChatStore } from "../../store/chatStore";
import { useProjectStore } from "../../store/projectStore";
import { Brand, Icon } from "../Icon";

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, logout } = useAuth();
  const { projects, activeProjectId, selectProject } = useProjectStore();
  const { chats, sidebarOpen, setSidebarOpen, createChat } = useChatStore();
  const inVault = /^\/(app|guest)(\/|$)/.test(location.pathname);
  const base = user ? "/app" : "/guest";
  const close = () => setSidebarOpen(false);
  const openProject = (id: string) => {
    selectProject(id);
    navigate(base);
    close();
  };
  const history = chats
    .filter(
      (chat) =>
        chat.messages.length &&
        (!inVault || chat.projectId === activeProjectId),
    )
    .slice(0, 4);
  const nav = (
    path: string,
    icon: string,
    label: string,
    active: boolean,
    count?: number,
  ) => (
    <Link
      className={`nav-item ${active ? "active" : ""}`}
      to={path}
      onClick={close}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {count !== undefined && <small>{count}</small>}
    </Link>
  );
  return (
    <>
      {sidebarOpen && (
        <button
          className="nav-backdrop"
          onClick={close}
          aria-label="Close navigation"
        />
      )}
      <aside
        className={`sidebar ${sidebarOpen ? "is-open" : ""}`}
        aria-label="Main navigation"
      >
        <Link to="/" className="sidebar-brand" onClick={close}>
          <Brand />
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">W</span>
          <div>
            <strong>My workspace</strong>
            <small>Personal library</small>
          </div>
          <span className="private-pill">Private</span>
        </div>
        <nav className="main-nav">
          {nav(
            "/",
            "grid",
            "All vaults",
            !inVault &&
              location.pathname !== "/settings" &&
              !params.get("view"),
            projects.length,
          )}
          {nav(
            "/?view=pinned",
            "pin",
            "Pinned",
            params.get("view") === "pinned",
            projects.filter((p) => p.pinned).length,
          )}
          {nav(
            "/?view=notes",
            "note",
            "Notebooks",
            params.get("view") === "notes",
          )}
        </nav>
        <div className="sidebar-section-head">
          <span>YOUR VAULTS</span>
          <Link
            to="/?create=1"
            className="icon-button"
            aria-label="Create a vault"
            onClick={close}
          >
            <Icon name="plus" size={16} />
          </Link>
        </div>
        <nav className="vault-nav">
          {projects.slice(0, 7).map((project) => (
            <button
              key={project.id}
              className={`vault-nav-item ${inVault && project.id === activeProjectId ? "selected" : ""}`}
              onClick={() => openProject(project.id)}
              title={project.name}
            >
              <span className={`vault-dot ${project.color ?? "blue"}`} />
              <span>{project.name}</span>
              {inVault && project.id === activeProjectId && (
                <Icon name="chevron" size={13} />
              )}
            </button>
          ))}
        </nav>
        {inVault && (
          <button
            className="new-conversation"
            onClick={() => {
              const id = createChat();
              navigate(`${base}/${id}`);
              close();
            }}
          >
            <Icon name="plus" size={16} /> New conversation
          </button>
        )}
        {history.length > 0 && (
          <>
            <div className="sidebar-section-head history-heading">
              <span>RECENT CONVERSATIONS</span>
            </div>
            <nav className="history-nav">
              {history.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => {
                    selectProject(chat.projectId);
                    navigate(`${base}/${chat.id}`);
                    close();
                  }}
                >
                  <Icon name="chat" size={15} />
                  <span>{chat.title}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="local-storage-note">
            <span className="status-dot" />
            <span>Notes saved on this device</span>
          </div>
          {nav(
            "/settings",
            "settings",
            "Settings",
            location.pathname === "/settings",
          )}
          <div className="profile-row">
            <span className="profile-avatar">
              {(user?.name ?? "Guest").charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{user?.name ?? "Guest workspace"}</strong>
              <small>{user?.email ?? "Your own space to explore"}</small>
            </div>
            {user ? (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() => void logout()}
              >
                <Icon name="logout" size={16} />
              </button>
            ) : (
              <Link
                className="icon-button"
                to="/login"
                aria-label="Sign in"
                onClick={close}
              >
                <Icon name="arrow" size={16} />
              </Link>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
