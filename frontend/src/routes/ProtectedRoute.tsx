import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "../lib/auth-client";

export function ProtectedRoute() {
  const { data, isPending } = useSession();

  if (isPending) {
    return (
      <div className="void-root flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border border-border border-t-accent" />
      </div>
    );
  }

  if (!data?.user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
