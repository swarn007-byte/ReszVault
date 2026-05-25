import { useCallback, useEffect, useState } from "react";
import { getApiBase } from "./api-base";

type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type AuthSession = {
  userId?: string;
};

type SessionData = {
  user: AuthUser | null;
  session: AuthSession | null;
};

type AuthResult = {
  data?: unknown;
  error?: { message?: string } | null;
};

async function authFetch(path: string, init?: RequestInit): Promise<AuthResult> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as AuthResult & {
    detail?: string;
  };
  if (!response.ok) {
    return { error: { message: body.detail ?? body.error?.message ?? `Request failed (${response.status})` } };
  }
  return body;
}

async function loadSession(): Promise<SessionData> {
  const response = await fetch(`${getApiBase()}/api/auth/session`, {
    credentials: "include",
  });
  if (!response.ok) return { user: null, session: null };
  return (await response.json()) as SessionData;
}

export function useSession() {
  const [data, setData] = useState<SessionData | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setIsPending(true);
    try {
      const session = await loadSession();
      setData(session);
      setError(null);
      return session;
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error("Could not load session");
      setError(nextError);
      setData({ user: null, session: null });
      return { user: null, session: null };
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    loadSession()
      .then((session) => {
        if (!alive) return;
        setData(session);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err : new Error("Could not load session"));
        setData({ user: null, session: null });
      })
      .finally(() => {
        if (alive) setIsPending(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { data, isPending, error, refetch };
}

export const authClient = {
  signUp: {
    email: async (payload: { name: string; email: string; password: string }) =>
      authFetch("/api/auth/sign-up/email", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },
  signIn: {
    email: async (payload: { email: string; password: string; rememberMe?: boolean }) =>
      authFetch("/api/auth/sign-in/email", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    social: async (payload: { provider: "google"; callbackURL: string }): Promise<AuthResult> => {
      const callback = new URL(payload.callbackURL).pathname || "/projects";
      window.location.href = `${getApiBase()}/api/auth/google/start?callbackURL=${encodeURIComponent(callback)}`;
      return { error: null };
    },
  },
  signOut: async () =>
    authFetch("/api/auth/sign-out", {
      method: "POST",
      body: JSON.stringify({}),
    }),
};

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;
export const signOut = authClient.signOut;
