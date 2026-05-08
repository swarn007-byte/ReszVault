import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProjectStore } from "../store/projectStore";

export function ProjectsPage() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const { projects, createProject, selectProject } = useProjectStore();
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

  const openProject = (id: string) => {
    selectProject(id);
    navigate("/app", { replace: true });
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const id = createProject({ name, description });
    openProject(id);
  };

  return (
    <main className="rv-project-page">
      <section className="rv-project-shell">
        <div className="rv-project-hero">
          <div>
            <div className="rv-project-kicker">Notebook rooms</div>
            <h1>Choose a vault, then work inside its sources.</h1>
            <p>
              Projects behave like focused notebooks: each one owns its sources,
              retrieval context, chats, and studio outputs.
            </p>
          </div>
          <div className="rv-project-status">
            <span><i /> sync ready</span>
            <strong>{projects.length}</strong>
            <small>available vaults</small>
          </div>
        </div>

        <div className="rv-project-grid">
          <form className="rv-project-create" onSubmit={handleCreate}>
            <span>New vault</span>
            <label>
              Vault name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Climate finance notebook"
                required
              />
            </label>
            <label>
              Short description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What sources and questions belong here?"
                rows={4}
              />
            </label>
            <button type="submit">Create vault</button>
          </form>

          <div className="rv-project-list">
            <span>Existing vaults</span>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="rv-project-card"
                onClick={() => openProject(project.id)}
              >
                <em>Notebook</em>
                <strong>{project.name}</strong>
                <small>{project.description}</small>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
