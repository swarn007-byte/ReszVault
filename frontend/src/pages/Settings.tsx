import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useThemeStore } from "../store/themeStore";
import { useProjectStore } from "../store/projectStore";
import { useChatStore } from "../store/chatStore";
import {
  WorkspaceFrame,
  PageHeader,
} from "../components/layout/WorkspaceFrame";
import { Icon } from "../components/Icon";
import { exportVault } from "../lib/export-vault";

export function Settings() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useThemeStore();
  const { projects, activeProjectId } = useProjectStore();
  const chats = useChatStore((state) => state.chats);
  const project =
    projects.find((item) => item.id === activeProjectId) ?? projects[0];
  return (
    <WorkspaceFrame>
      <PageHeader title="Settings" />
      <div className="settings-content">
        <span className="eyebrow">A SPACE THAT FEELS LIKE YOU</span>
        <h1>Make yourself at home.</h1>
        <p>A few small details for the way you work.</p>
        <section className="settings-section">
          <h2>Appearance</h2>
          <p>Set the mood for your workspace.</p>
          <div className="appearance-grid">
            {(["light", "dark"] as const).map((choice) => (
              <button
                key={choice}
                className={`appearance-choice ${theme === choice ? "selected" : ""}`}
                aria-pressed={theme === choice}
                onClick={() => setTheme(choice)}
              >
                <span className={`appearance-preview ${choice}`}>
                  <i />
                  <b />
                </span>
                <span>
                  {choice === "light" ? "Light & airy" : "After hours"}
                  {theme === choice && <Icon name="check" size={13} />}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <h2>Your workspace</h2>
          <p>
            Vault names, conversations, and notebook entries are saved in this
            browser. Uploaded documents are stored by the connected ReszVault
            service. Export a vault to keep a Markdown copy of your work.
          </p>
          <dl className="properties">
            <div>
              <dt>Vaults</dt>
              <dd>{projects.length}</dd>
            </div>
            <div>
              <dt>Saved conversations</dt>
              <dd>{chats.filter((chat) => chat.messages.length).length}</dd>
            </div>
            <div>
              <dt>Notebook words</dt>
              <dd>
                {projects.reduce(
                  (count, item) =>
                    count +
                    (item.notes?.trim()
                      ? item.notes.trim().split(/\s+/).length
                      : 0),
                  0,
                )}
              </dd>
            </div>
          </dl>
          {project && (
            <button className="button" onClick={() => exportVault(project)}>
              <Icon name="download" size={15} />
              Export {project.name}
            </button>
          )}
        </section>
        <section className="settings-section">
          <h2>Account</h2>
          <div className="account-details">
            <span className="profile-avatar">
              {(user?.name ?? "Guest").charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{user?.name ?? "Guest workspace"}</strong>
              <p>{user?.email ?? "You can research without an account."}</p>
            </div>
          </div>
          {user ? (
            <button className="button" onClick={() => void logout()}>
              <Icon name="logout" size={15} />
              Sign out
            </button>
          ) : (
            <Link className="button" to="/login">
              Sign in to your account <Icon name="arrow" size={15} />
            </Link>
          )}
        </section>
        <section className="settings-section">
          <h2>Keep your flow</h2>
          <div className="keyboard-hint">
            <kbd>Enter</kbd> Send your question
          </div>
          <div className="keyboard-hint">
            <kbd>Shift ↵</kbd> Add a new line
          </div>
          <div className="keyboard-hint">
            <kbd>Esc</kbd> Close dialogs and document previews
          </div>
        </section>
      </div>
    </WorkspaceFrame>
  );
}
