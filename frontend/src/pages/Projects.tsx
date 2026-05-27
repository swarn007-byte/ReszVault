import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProjectStore } from "../store/projectStore";

export function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useAuth();
  const { projects, activeProjectId, createProject, selectProject } = useProjectStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  if (isLoading) {
    return (
      <div className="rv-auth-page">
        <div className="rv-loader" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const isManagingProjects = new URLSearchParams(location.search).get("manage") === "1";
  if (activeProjectId && !isManagingProjects) {
    return <Navigate to="/app" replace />;
  }

  const openProject = (id: string) => {
    selectProject(id);
    navigate("/app", { replace: true });
  };

  const createVault = (input: { name: string; description?: string }) => {
    const trimmed = input.name.trim();
    if (!trimmed) return;
    const id = createProject({ name: trimmed, description: input.description });
    openProject(id);
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    createVault({ name, description });
  };

  return (
    <main className="rv-project-page">
      <section className="rv-project-shell">
        <div className="rv-project-hero">
          <div>
            <span className="rv-project-kicker">Vaults</span>
            <h1>Choose a project.</h1>
            <p>
              Keep uploaded PDFs, chats, and source graph context together.
            </p>
          </div>
        </div>

        <div className="rv-project-grid">
          <section className="rv-project-list" aria-label="Existing vaults">
            <div className="rv-project-section-head">
              <span>Existing projects</span>
              <small>Open a vault and continue in chat.</small>
            </div>
            <div className="rv-project-cards">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="rv-project-card"
                  onClick={() => openProject(project.id)}
                >
                  <span>Vault</span>
                  <strong>{project.name}</strong>
                  <small>{project.description}</small>
                  <em>
                    {project.sourceCount} sources · {project.graphNodes} graph nodes
                  </em>
                </button>
              ))}
            </div>
          </section>

          <aside className="rv-project-create" aria-label="Create vault">
            <div className="rv-project-section-head">
              <span>New project</span>
              <small>Start clean, then upload PDFs.</small>
            </div>
            <form onSubmit={handleCreate}>
              <label>
                Project name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. AI intern screening"
                  required
                />
              </label>
              <label>
                Short description
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What sources belong here?"
                  rows={3}
                />
              </label>
              <button type="submit">Create vault</button>
            </form>
          </aside>
        </div>
      </section>
    </main>
  );
}
