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
  data?: { user?: AuthUser; session?: { token?: string } };
  error?: { message?: string } | null;
};

const SESSION_TOKEN_KEY = "reszvault-session-token";
const GITHUB_VERIFIER_KEY = "reszvault-github-verifier";

export async function startGitHubSignIn() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  window.sessionStorage.setItem(GITHUB_VERIFIER_KEY, verifier);
  window.location.assign(`/api/auth/github/start?challenge=${encodeURIComponent(challenge)}`);
}

export async function finishGitHubSignIn(code: string) {
  const verifier = window.sessionStorage.getItem(GITHUB_VERIFIER_KEY);
  window.sessionStorage.removeItem(GITHUB_VERIFIER_KEY);
  if (!verifier) throw new Error("Start GitHub sign-in again in this tab.");
  const result = await authFetch("/api/auth/github/exchange", {
    method: "POST",
    body: JSON.stringify({ code, verifier }),
  });
  if (!result.data?.session?.token) {
    throw new Error(result.error?.message ?? "GitHub sign-in could not be completed.");
  }
}

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

async function authFetch(path: string, init?: RequestInit): Promise<AuthResult> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    credentials: "include",
    signal: AbortSignal.timeout(12000),
    headers: {
      "Content-Type": "application/json",
      "x-session-token": getSessionToken(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return { error: { message: "The authentication service is unavailable. Try again shortly." } };
  }
  const body = (await response.json().catch(() => ({}))) as AuthResult & {
    detail?: string;
    data?: { session?: { token?: string } };
  };
  if (!response.ok) {
    return { error: { message: body.detail ?? body.error?.message ?? `Request failed (${response.status})` } };
  }
  if (path.endsWith("/email") && !body.error && (!body.data?.user?.id || !body.data.session?.token)) {
    return { error: { message: "Authentication could not be completed. Try again." } };
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
    signal: AbortSignal.timeout(12000),
    headers: {
      "x-session-token": getSessionToken(),
    },
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("The authentication service is unavailable. Try again shortly.");
  }
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
  signOut: async () => {
    const result = await authFetch("/api/auth/sign-out", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (result.error) throw new Error(result.error.message ?? "Could not sign out.");
    setSessionToken("");
  },
};

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;
export const signOut = authClient.signOut;
