import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { askProject, attachProjectRepository, loadProject, projectError, uploadProjectPdf, type ProjectDetail, type ProjectRepository } from "../api/projects";
import { getGitHubAccess } from "../api/github";
import { ChatWindow } from "../components/ChatWindow/ChatWindow";
import { InputBar } from "../components/InputBar/InputBar";
import { SessionRecovery } from "../components/SessionRecovery";
import { useAuth } from "../hooks/useAuth";
import { useChatStore } from "../store/chatStore";

export function ProjectWorkspacePage() {
  const { projectId, chatId } = useParams();
  const { user, isLoading, error, refetch } = useAuth();
  if (isLoading) return <p className="workspace-loading">Loading project…</p>;
  if (!user && error) return <SessionRecovery onRetry={refetch} />;
  if (!user) return <Navigate to="/login" replace />;
  if (!projectId) return <Navigate to="/workspaces" replace />;
  return <Workspace key={`${user.id}:${projectId}`} ownerId={user.id} projectId={projectId} chatId={chatId} />;
}

const EXAMPLE_QUESTIONS = [
  "Summarize the sources in this project.",
  "How does this repository relate to the uploaded PDF?",
];

function repositoryStatus(source: ProjectRepository) {
  if (source.state === "syncing") return "Indexing…";
  if (source.state === "missing") return "Waiting to index";
  if (source.state === "failed") return "Index failed";
  return `${source.sourceCount} ${source.sourceCount === 1 ? "excerpt" : "excerpts"}${source.state === "stale" ? " · refresh available" : ""}`;
}

function Workspace({ ownerId, projectId, chatId }: { ownerId: string; projectId: string; chatId?: string }) {
  const navigate = useNavigate();
  const path = `/workspaces/${projectId}`;
  const allChats = useChatStore((state) => state.chats);
  const chats = allChats.filter((chat) => chat.ownerId === ownerId && chat.projectId === projectId);
  const activeChat = chats.find((chat) => chat.id === chatId);
  const fileInput = useRef<HTMLInputElement>(null);
  const repoInput = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<ProjectDetail>();
  const [loadError, setLoadError] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [sourceNotice, setSourceNotice] = useState("");
  const [installationUrl, setInstallationUrl] = useState("");
  const [showRepoForm, setShowRepoForm] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [working, setWorking] = useState<"pdf" | "repo" | null>(null);
  const [sendingChatId, setSendingChatId] = useState<string>();
  const hasPendingIndex = project?.repositories.some((repo) => repo.state === "syncing");

  useEffect(() => {
    const controller = new AbortController();
    loadProject(projectId, controller.signal).then(setProject).catch((failure: unknown) => {
      if (!controller.signal.aborted) setLoadError(projectError(failure));
    });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    if (!hasPendingIndex) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void loadProject(projectId, controller.signal).then((current) => {
        if (controller.signal.aborted) return;
        const statuses = new Map(current.repositories.map((repo) => [repo.id, repo]));
        setProject((previous) => previous && {
          ...previous,
          repositories: previous.repositories.map((repo) => statuses.get(repo.id) ?? repo),
        });
      }).catch(() => {});
    }, 4000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [hasPendingIndex, projectId]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setWorking("pdf");
    setSourceError("");
    setSourceNotice("");
    const failures: string[] = [];
    let added = 0;
    for (const file of files) {
      try {
        const pdf = await uploadProjectPdf(projectId, file);
        setProject((previous) => previous && { ...previous, pdfs: [pdf, ...previous.pdfs] });
        added += 1;
      } catch (failure) {
        failures.push(`${file.name}: ${projectError(failure)}`);
      }
    }
    if (failures.length) setSourceError(failures.join(" "));
    if (added) setSourceNotice(`${added} PDF${added === 1 ? "" : "s"} indexed.`);
    setWorking(null);
  }

  async function attach(name: string, refresh = false) {
    setWorking("repo");
    setSourceError("");
    setSourceNotice("");
    try {
      const repository = await attachProjectRepository(projectId, name, refresh);
      setProject((previous) => previous && {
        ...previous,
        repositories: [...previous.repositories.filter((source) => source.id !== repository.id), repository],
      });
      setRepoName("");
      setShowRepoForm(false);
      setSourceNotice(refresh ? "Repository sync requested." : "Repository added.");
    } catch (failure) {
      setSourceError(projectError(failure));
    } finally {
      setWorking(null);
    }
  }

  function openRepoForm() {
    setShowRepoForm(true);
    window.requestAnimationFrame(() => repoInput.current?.focus());
    if (ownerId.startsWith("github_")) void getGitHubAccess().then(setInstallationUrl).catch(() => {});
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || sendingChatId || !project || !(project.pdfs.length || project.repositories.length)) return;
    const { createChat, addMessage, setMessageContent } = useChatStore.getState();
    const id = activeChat?.id ?? createChat(undefined, ownerId, projectId);
    const previousQuestions = activeChat?.messages.filter((message) => message.role === "user")
      .slice(-4).map((message) => message.content.slice(0, 1000)) ?? [];
    addMessage(id, { role: "user", content: question });
    const responseId = addMessage(id, { role: "assistant", content: "" });
    setSendingChatId(id);
    if (id !== chatId) navigate(`${path}/${id}`, { replace: true });
    try {
      setMessageContent(id, responseId, await askProject(projectId, question, previousQuestions));
    } catch (failure) {
      setMessageContent(id, responseId, projectError(failure));
    } finally {
      setSendingChatId(undefined);
    }
  }

  if (loadError) return <main className="workspace-loading"><p role="alert">{loadError}</p><Link to="/workspaces">Back to Projects</Link></main>;
  if (!project) return <p className="workspace-loading" role="status">Loading project…</p>;
  if (chatId && !activeChat) return <Navigate to={path} replace />;

  const sourceCount = project.pdfs.length + project.repositories.length;
  const placeholder = "Ask about your project sources…";

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar" aria-label="Project sources and chats">
        <Link to="/workspaces" className="workspace-back">← All projects</Link>
        <div className="workspace-identity">
          <span className="workspace-icon" aria-hidden="true">◇</span>
          <div><h1>{project.name}</h1>{project.description && <p>{project.description}</p>}</div>
        </div>
        <section className="workspace-source-section">
          <h2>Sources <span>{sourceCount}</span></h2>
          <input type="file" ref={fileInput} onChange={(event) => void upload(event)}
            accept=".pdf,application/pdf" multiple hidden aria-label="Select project PDFs" />
          <div className="workspace-source-actions">
            <button className="workspace-button" type="button" disabled={!!working} onClick={() => fileInput.current?.click()}>
              {working === "pdf" ? "Uploading…" : "+ Upload PDFs"}
            </button>
            <button className="workspace-button" type="button" disabled={!!working} onClick={openRepoForm}>+ Add GitHub repo</button>
          </div>
          {showRepoForm && (
            <form className="workspace-repo-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void attach(repoName);
            }}>
              <label>GitHub repository<input ref={repoInput} value={repoName} onChange={(event) => setRepoName(event.target.value)} required maxLength={230} placeholder="owner/repository" /></label>
              <div className="workspace-actions">
                <button className="workspace-button" type="button" onClick={() => setShowRepoForm(false)}>Cancel</button>
                <button className="workspace-button workspace-primary" type="submit" disabled={!!working}>{working === "repo" ? "Checking…" : "Add repository"}</button>
              </div>
              {ownerId.startsWith("github_")
                ? installationUrl && <a className="workspace-back" href={installationUrl} target="_blank" rel="noreferrer">Grant private repository access</a>
                : <p className="workspace-notice">Private repositories require a GitHub account.</p>}
            </form>
          )}
          {sourceError && <p className="workspace-error" role="alert">{sourceError}</p>}
          {sourceNotice && <p className="workspace-notice" role="status">{sourceNotice}</p>}
          {sourceCount > 0 && (
            <ul className="workspace-source-list">
              {project.repositories.map((repo) => (
                <li key={repo.id}>
                  <span className="workspace-kind" aria-label="GitHub">GH</span>
                  <div><a href={`https://github.com/${repo.name}`} target="_blank" rel="noreferrer">{repo.name}</a><small>{repositoryStatus(repo)}</small></div>
                  {["failed", "stale", "missing"].includes(repo.state) && <button type="button" className="workspace-text-button" disabled={!!working} onClick={() => void attach(repo.name, true)}>Sync</button>}
                </li>
              ))}
              {project.pdfs.map((pdf) => (
                <li key={pdf.id}>
                  <span className="workspace-kind workspace-kind-pdf">PDF</span>
                  <div><strong title={pdf.filename}>{pdf.title}</strong><small>{pdf.chunkCount} {pdf.chunkCount === 1 ? "excerpt" : "excerpts"}</small></div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="workspace-history">
          <div className="workspace-history-heading"><h2>Chats</h2><Link to={path} className="workspace-button">+ New chat</Link></div>
          {chats.length > 0 ? <nav aria-label="Project chats">
            {chats.map((chat) => <Link key={chat.id} aria-current={chat.id === chatId ? "page" : undefined} to={`${path}/${chat.id}`}>{chat.title}</Link>)}
          </nav> : <p>No chats yet.</p>}
        </section>
      </aside>

      <main className="workspace-main">
        <header className="workspace-main-header">
          <div><p>{project.name}</p><h2>{activeChat?.title ?? "Project chat"}</h2></div>
          <span>{sourceCount} {sourceCount === 1 ? "source" : "sources"}{hasPendingIndex ? " · indexing" : ""}</span>
        </header>
        {activeChat ? <ChatWindow chat={activeChat} onSend={(question) => void send(question)}
          isSending={!!sendingChatId} streamingMessageId={sendingChatId === activeChat.id ? activeChat.messages.at(-1)?.id : undefined}
          placeholder={placeholder} /> : (
          <div className="workspace-chat-empty">
            <div className="workspace-chat-intro">
              <span className="workspace-icon" aria-hidden="true">◇</span>
              <h2>{sourceCount ? "Ask across your sources" : "Add your first source"}</h2>
              <p>{sourceCount ? "Ask about code, a PDF, or how the two connect." : "Add a GitHub repo or upload a PDF to start asking questions."}</p>
              <div className="workspace-empty-actions">
                {sourceCount ? EXAMPLE_QUESTIONS.map((question) => (
                  <button className="workspace-button" type="button" key={question} disabled={!!sendingChatId} onClick={() => void send(question)}>{question}</button>
                )) : (
                  <>
                    <button className="workspace-button workspace-primary" type="button" disabled={!!working} onClick={openRepoForm}>Add GitHub repo</button>
                    <button className="workspace-button" type="button" disabled={!!working} onClick={() => fileInput.current?.click()}>Upload PDFs</button>
                  </>
                )}
              </div>
            </div>
            <div className="workspace-composer"><InputBar onSend={(question) => void send(question)} disabled={!sourceCount || !!sendingChatId} placeholder={placeholder} /></div>
          </div>
        )}
      </main>
    </div>
  );
}
