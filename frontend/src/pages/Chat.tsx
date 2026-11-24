import { SessionRecovery } from "../components/SessionRecovery";
import { AppShell } from "../components/layout/AppShell";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProjectStore } from "../store/projectStore";
import { useEffect } from "react";

/** Main chat interface — sidebar + message area */
export function ChatPage({ allowGuest = false, pdfWorkspace = false }: { allowGuest?: boolean; pdfWorkspace?: boolean }) {
  const { user, isLoading, error, refetch } = useAuth();
  const activeProject = useProjectStore((state) => state.activeProject());
  const githubUser = user?.id.startsWith("github_") ?? false;
  const selectDefaultProject = useProjectStore((state) => state.selectDefaultProject);
  const useDefaultProject = allowGuest || githubUser || pdfWorkspace;

  useEffect(() => {
    if (useDefaultProject && !activeProject) {
      selectDefaultProject();
    }
  }, [activeProject, useDefaultProject, selectDefaultProject]);

  if (isLoading && !allowGuest) {
    return (
      <div className="rv-auth-page">
        <div className="rv-loader" />
      </div>
    );
  }

  if (!user && !allowGuest && error) return <SessionRecovery onRetry={refetch} />;
  if (!user && !allowGuest) return <Navigate to="/login" replace />;
  if (useDefaultProject && !activeProject) {
    return (
      <div className="rv-auth-page">
        <div className="rv-loader" />
      </div>
    );
  }
  if (!activeProject) return <Navigate to="/projects" replace />;

  return <AppShell userId={allowGuest ? undefined : user?.id} pdfWorkspace={pdfWorkspace} />;
}
