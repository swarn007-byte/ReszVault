import { useNavigate } from "react-router-dom";
import { authClient, signOut, useSession } from "../lib/auth-client";

/** Backend cookie and header sessions share the same auth state. */
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
