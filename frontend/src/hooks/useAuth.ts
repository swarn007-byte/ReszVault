import { useNavigate } from "react-router-dom";
import { authClient, signOut, useSession } from "../lib/auth-client";

/** Single source of truth for auth state + actions (Better Auth). */
export function useAuth() {
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useSession();

  const user = data?.user ?? null;
  const authSession = data?.session ?? null;

  const logout = async () => {
    await signOut();
    await refetch();
    navigate("/", { replace: true });
  };

  return {
    user,
    session: authSession,
    isLoading: isPending,
    error,
    isAuthenticated: !!user,
    logout,
    refetch,
    signIn: authClient.signIn,
    signUp: authClient.signUp,
  };
}
