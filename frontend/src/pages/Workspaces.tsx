import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { createProject, listProjects, projectError, type Project } from "../api/projects";
import { SessionRecovery } from "../components/SessionRecovery";
import { useAuth } from "../hooks/useAuth";

export function WorkspacesPage() {
  const { user, isLoading, error, refetch } = useAuth();
  if (isLoading) return <p className="workspace-loading">Loading projects…</p>;
  if (!user && error) return <SessionRecovery onRetry={refetch} />;
  if (!user) return <Navigate to="/login" replace />;
  return <ProjectDirectory key={user.id} />;
}

function ProjectDirectory() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listProjects(controller.signal).then(setProjects).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(projectError(failure));
    });
    return () => controller.abort();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const project = await createProject(name.trim(), description.trim());
      navigate(`/workspaces/${project.id}`);
    } catch (failure) {
      setError(projectError(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workspace-directory">
      <header className="workspace-directory-nav">
        <Link to="/app" className="workspace-wordmark"><img src="/github-avatar.png" alt="" /> ReszVault</Link>
        <Link className="workspace-button" to="/app">Open GitHub Chat</Link>
      </header>
      <main className="workspace-directory-main">
        <div className="workspace-directory-heading">
          <div><h1>Projects</h1><p>Bring GitHub repositories, PDFs, and the conversations about them into one workspace.</p></div>
          <button className="workspace-button workspace-primary" type="button" disabled={!projects} onClick={() => setCreating(true)}>+ New project</button>
        </div>
        {creating && (
          <form className="workspace-create" onSubmit={handleCreate}>
            <label>Project name<input required autoFocus maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Satellite image research" /></label>
            <label>Description <span>(optional)</span><textarea rows={2} maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <div className="workspace-actions">
              <button className="workspace-button" type="button" onClick={() => setCreating(false)}>Cancel</button>
              <button className="workspace-button workspace-primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create project"}</button>
            </div>
          </form>
        )}
        {error && <p className="workspace-error" role="alert">{error}</p>}
        {!error && !projects && <p role="status">Loading projects…</p>}
        {projects?.length === 0 && !creating && (
          <section className="workspace-directory-empty">
            <span className="workspace-icon" aria-hidden="true">◇</span>
            <h2>Start with a project</h2>
            <p>Add a repository or upload a PDF, then ask questions in the same chat.</p>
          </section>
        )}
        {projects && projects.length > 0 && (
          <div className="workspace-card-grid">
            {projects.map((project) => (
              <Link key={project.id} className="workspace-project-card" to={`/workspaces/${project.id}`}>
                <div className="workspace-card-top"><span className="workspace-icon" aria-hidden="true">◇</span><span aria-hidden="true">↗</span></div>
                <h2>{project.name}</h2>
                {project.description && <p>{project.description}</p>}
                <div className="workspace-card-counts"><span>{project.pdfCount} {project.pdfCount === 1 ? "PDF" : "PDFs"}</span><span>{project.repoCount} {project.repoCount === 1 ? "repository" : "repositories"}</span></div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
