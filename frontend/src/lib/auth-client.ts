import { useCallback, useEffect, useRef, useState } from "react";
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
  data?: { user?: AuthUser; session?: { token?: string } };
  error?: { message?: string } | null;
};

const SESSION_TOKEN_KEY = "reszvault-session-token";

export function getSessionToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SESSION_TOKEN_KEY) ?? "";
}

export function setSessionToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  }
}

async function authFetch(
  path: string,
  init?: RequestInit,
): Promise<AuthResult> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    credentials: "include",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/json",
      "x-session-token": getSessionToken(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return { error: { message: "The sign-in service is unavailable. Please try again in a moment." } };
  }
  const body = (await response.json().catch(() => ({}))) as AuthResult & {
    detail?: string;
    data?: { session?: { token?: string } };
  };
  if (!response.ok) {
    return {
      error: {
        message:
          body.detail ??
          body.error?.message ??
          `Request failed (${response.status})`,
      },
    };
  }
  if (path.includes("/sign-in/email") || path.includes("/sign-up/email")) {
    if (body.error) return body;
    if (!body.data?.user?.id || !body.data?.session?.token) {
      return { error: { message: "Sign-in could not be completed. Please try again." } };
    }
  }
  // Store session token from response for Vercel proxy compatibility
  if (body.data?.session?.token) {
    setSessionToken(body.data.session.token);
  }
  return body;
}

async function loadSession(): Promise<SessionData> {
  const response = await fetch(`${getApiBase()}/api/auth/session`, {
    credentials: "include",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "x-session-token": getSessionToken(),
    },
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("The sign-in service is unavailable. Please try again.");
  return (await response.json()) as SessionData;
}

export function useSession() {
  const [data, setData] = useState<SessionData | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const revision = useRef(0);

  const refetch = useCallback(async () => {
    const request = ++revision.current;
    setIsPending(true);
    try {
      const session = await loadSession();
      if (request === revision.current) {
        setData(session);
        setError(null);
      }
      return session;
    } catch (err) {
      const nextError =
        err instanceof Error ? err : new Error("Could not load session");
      if (request === revision.current) {
        setError(nextError);
        setData({ user: null, session: null });
      }
      return { user: null, session: null };
    } finally {
      if (request === revision.current) setIsPending(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const sessionRevision = revision;
    const request = ++sessionRevision.current;
    loadSession()
      .then((session) => {
        if (!alive || request !== revision.current) return;
        setData(session);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive || request !== revision.current) return;
        setError(
          err instanceof Error ? err : new Error("Could not load session"),
        );
        setData({ user: null, session: null });
      })
      .finally(() => {
        if (alive && request === revision.current) setIsPending(false);
      });
    return () => {
      alive = false;
      sessionRevision.current++;
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
    email: async (payload: {
      email: string;
      password: string;
      rememberMe?: boolean;
    }) =>
      authFetch("/api/auth/sign-in/email", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    social: async (payload: {
      provider: "google";
      callbackURL: string;
    }): Promise<AuthResult> => {
      const callback = new URL(payload.callbackURL).pathname || "/projects";
      window.location.href = `${getApiBase()}/api/auth/google/start?callbackURL=${encodeURIComponent(callback)}`;
      return { error: null };
    },
  },
  signOut: async () => {
    const result = await authFetch("/api/auth/sign-out", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (result.error)
      throw new Error(
        result.error.message ?? "Could not sign out. Please try again.",
      );
    setSessionToken("");
    return result;
  },
};

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;
export const signOut = authClient.signOut;
