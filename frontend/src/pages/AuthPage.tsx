import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authClient, useSession } from "../lib/auth-client";

type Mode = "sign-in" | "sign-up";

export function AuthPage() {
  const { data, isPending } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSocial = async (provider: "google" | "twitter") => {
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await authClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}/projects`,
      });
      if (authError) throw new Error(authError.message ?? "Social sign-in failed");
    } catch (authError) {
      setError(
        authError instanceof Error ? authError.message : "Social sign-in failed",
      );
      setLoading(false);
    }
  };

  return (
    <main className="rv-auth">
      <Link className="rv-auth-brand" to="/">
        <span>R</span>
        <strong>reszvault</strong>
      </Link>

      <section className="rv-auth-stage">
        <div className="rv-auth-story" aria-hidden="true">
          <div className="rv-auth-orbit">
            <span className="node node-main">Vault</span>
            <span className="node node-a">PDF</span>
            <span className="node node-b">Claim</span>
            <span className="node node-c">Note</span>
            <span className="node node-d">Source</span>
            <i className="edge edge-a" />
            <i className="edge edge-b" />
            <i className="edge edge-c" />
            <i className="edge edge-d" />
          </div>

          <div className="rv-auth-copy">
            <p>Private research room</p>
            <h1>Bring the papers. Keep the evidence.</h1>
            <span>
              Projects, PDFs, source-scoped chat, and grounded answers stay in
              one focused workspace.
            </span>
          </div>

          <div className="rv-auth-proof">
            <div>
              <small>active source</small>
              <strong>attention-is-all-you-need.pdf</strong>
            </div>
            <div>
              <small>indexed chunks</small>
              <strong>42 ready</strong>
            </div>
          </div>
        </div>

        <section className="rv-auth-card">
          <div className="rv-auth-card-head">
            <span>{isSignUp ? "Create account" : "Welcome back"}</span>
            <h2>{isSignUp ? "Start a research vault." : "Sign in to ReszVault."}</h2>
            <p>
              {isSignUp
                ? "Create your workspace, add sources, and ask questions with context."
                : "Open your projects, upload PDFs, and continue your grounded chats."}
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
            <button type="button" disabled={loading} onClick={() => handleSocial("twitter")}>
              <XMark />
              X
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

          <button className="rv-auth-back" type="button" onClick={() => navigate("/")}>
            Back to website
          </button>

          <button className="rv-auth-guest" type="button" onClick={() => navigate("/guest")}>
            Enter as guest
          </button>
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

function XMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M14.6 10.4 22.8 1h-1.95l-7.12 8.15L8.04 1H1.5l8.6 12.31L1.5 23h1.95l7.52-8.61L16.98 23h6.54l-8.92-12.6Zm-2.66 3.04-.87-1.23L4.14 2.44h2.96l5.6 7.9.87 1.23 7.28 10.28h-2.96l-5.95-8.41Z" />
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
