import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { useChatStore } from "../store/chatStore";
import { VoidBackdrop } from "./AuthPage";
import { ThemeToggle } from "../components/ThemeToggle";
import { useThemeStore } from "../store/themeStore";

export function Settings() {
  const { user, logout, isLoading, error, refetch } = useAuth();
  const { chats } = useChatStore();
  const { theme } = useThemeStore();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  if (!isLoading && !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <VoidBackdrop>
      <div className="relative z-20 mx-auto min-h-screen max-w-lg px-6 py-10">
        <div className="flex items-center justify-between">
          <Link
            to="/app"
            className="text-xs uppercase tracking-widest text-text-muted transition-colors hover:text-text"
          >
            ← Back to chat
          </Link>
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8"
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">Account</p>
          <h1 className="mt-2 font-serif text-2xl text-text">Settings</h1>

          {error && (
            <p className="mt-3 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              Session error: {error.message}
            </p>
          )}

          <section className="mt-8 space-y-4">
            <div className="rounded-xl border border-border bg-elevated/80 p-5 backdrop-blur-sm">
              <h2 className="text-xs font-medium uppercase tracking-widest text-text-muted">
                Profile
              </h2>
              <p className="mt-3 text-xs text-text-muted">
                Appearance: <span className="text-text capitalize">{theme} mode</span>
              </p>
              {isLoading ? (
                <div className="mt-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-border/60" />
                  ))}
                </div>
              ) : (
                <dl className="mt-4 space-y-4 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-text-muted">Name</dt>
                    <dd className="mt-1 text-text">{user?.name || "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-text-muted">Email</dt>
                    <dd className="mt-1 text-text">{user?.email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-text-muted">User ID</dt>
                    <dd className="mt-1 truncate font-mono text-xs text-text-muted">
                      {user?.id || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-text-muted">
                      Saved chats (local)
                    </dt>
                    <dd className="mt-1 text-text">{chats.length}</dd>
                  </div>
                </dl>
              )}
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut || isLoading}
              className="w-full rounded-lg border border-red-900/40 bg-red-950/20 py-3 text-sm text-red-300 transition-colors hover:border-red-800/60 hover:bg-red-950/40 disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </section>
        </motion.div>
      </div>
    </VoidBackdrop>
  );
}
