import { AppShell } from "../components/layout/AppShell";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProjectStore } from "../store/projectStore";
import { useEffect } from "react";

/** Main chat interface — sidebar + message area */
export function ChatPage({ allowGuest = false }: { allowGuest?: boolean }) {
  const { user, isLoading } = useAuth();
  const activeProject = useProjectStore((state) => state.activeProject());
  const selectDefaultProject = useProjectStore((state) => state.selectDefaultProject);

  useEffect(() => {
    if (allowGuest && !activeProject) {
      selectDefaultProject();
    }
  }, [activeProject, allowGuest, selectDefaultProject]);

  if (isLoading) {
    return (
      <div className="rv-auth-page">
        <div className="rv-loader" />
      </div>
    );
  }

  if (!user && !allowGuest) return <Navigate to="/login" replace />;
  if (allowGuest && !activeProject) {
    return (
      <div className="rv-auth-page">
        <div className="rv-loader" />
      </div>
    );
  }
  if (!activeProject) return <Navigate to="/projects" replace />;

  return <AppShell />;
}
