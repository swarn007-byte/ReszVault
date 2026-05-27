import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authClient, useSession } from "../lib/auth-client";

type Mode = "sign-in" | "sign-up";
type ProviderConfig = { google: boolean };

export function AuthPage() {
  const { data, isPending } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig>({
    google: true,
  });

  useEffect(() => {
    let alive = true;
    fetch("/auth/providers")
      .then((response) => (response.ok ? response.json() : null))
      .then((config: ProviderConfig | null) => {
        if (alive && config) setProviders(config);
      })
      .catch(() => {
        if (alive) setProviders({ google: true });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!isPending && data?.user) return <Navigate to="/projects" replace />;

  const isSignUp = mode === "sign-up";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error: authError } = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
        });
        if (authError) throw new Error(authError.message ?? "Sign up failed");
      } else {
        const { error: authError } = await authClient.signIn.email({
          email: email.trim(),
          password,
          rememberMe: true,
        });
        if (authError) throw new Error(authError.message ?? "Sign in failed");
      }

      navigate("/projects", { replace: true });
    } catch (authError) {
      setError(
        authError instanceof Error ? authError.message : "Authentication failed",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider: "google") => {
    if (!providers[provider]) {
      setError("Google login is not configured on the backend.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await authClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}/projects`,
      });
      if (authError) throw new Error(authError.message ?? "Social sign-in failed");
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "Social sign-in failed";
      setError(
        message.includes("Failed to fetch") || message.includes("500")
          ? "Authentication server is reachable, but the auth database is not. Check DATABASE_URL in backend/.env."
          : message,
      );
      setLoading(false);
    }
  };

  return (
    <main className="rv-auth">
      <Link className="rv-auth-brand" to="/">
        <img src="/github-avatar.png" alt="" />
        <strong>reszvault</strong>
      </Link>

      <section className="rv-auth-stage">
        <section className="rv-auth-card">
          <div className="rv-auth-card-head">
            <span>{isSignUp ? "Create account" : "Authentication"}</span>
            <h2>{isSignUp ? "Create your workspace." : "Sign in to continue."}</h2>
            <p>
              {isSignUp
                ? "Create a project space for PDFs, source selection, and saved chats."
                : "Access saved projects, uploaded sources, and previous research threads."}
            </p>
          </div>

          <div className="rv-auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              aria-selected={!isSignUp}
              onClick={() => {
                setMode("sign-in");
                setError(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-selected={isSignUp}
              onClick={() => {
                setMode("sign-up");
                setError(null);
              }}
            >
              Create account
            </button>
          </div>

          <div className="rv-social-grid">
            <button type="button" disabled={loading} onClick={() => handleSocial("google")}>
              <GoogleMark />
              Google
            </button>
          </div>

          <div className="rv-auth-divider">
            <span />
            <small>or continue with email</small>
            <span />
          </div>

          <form className="rv-auth-form" onSubmit={handleSubmit}>
            {isSignUp && (
              <label>
                Full name
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Swarn"
                  autoComplete="name"
                />
              </label>
            )}

            <label>
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isSignUp ? "At least 8 characters" : "Your password"}
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
            </label>

            {error && <p className="rv-auth-error" role="alert">{error}</p>}

            <button className="rv-auth-submit" type="submit" disabled={loading}>
              {loading
                ? isSignUp
                  ? "Creating account..."
                  : "Signing in..."
                : isSignUp
                  ? "Create workspace"
                  : "Enter workspace"}
            </button>
          </form>

          <div className="rv-auth-secondary-actions">
            <button className="rv-auth-back" type="button" onClick={() => navigate("/")}>
              Back
            </button>

            <button className="rv-auth-guest" type="button" onClick={() => navigate("/guest")}>
              Guest
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a10.99 10.99 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A10.99 10.99 0 0 0 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

export default AuthPage;

export function VoidBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {children}
    </div>
  );
}
