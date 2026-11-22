import { useEffect, useState } from "react";
import { githubError, loadRepositoryIndex, type RepositoryIndex } from "../api/github";

export function RepositoryIndexStatus({ repository }: { repository: string }) {
  const [index, setIndex] = useState<RepositoryIndex | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const syncing = index?.state === "syncing";

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    async function check(action: "start" | "status") {
      let delay = 15000;
      try {
        let status = await loadRepositoryIndex(repository, action);
        if (!active) return;
        if (action === "status" && status.state === "stale") {
          status = await loadRepositoryIndex(repository, "start");
          if (!active) return;
        }
        setIndex(status);
        setError("");
        if (status.state === "syncing") delay = 3500;
      } catch (failure) {
        if (active) setError(githubError(failure));
      }
      if (active) timer = window.setTimeout(() => void check("status"), delay);
    }

    void check("start");
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [repository]);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      setIndex(await loadRepositoryIndex(repository, "refresh"));
    } catch (failure) {
      setError(githubError(failure));
    } finally {
      setRefreshing(false);
    }
  }

  const label = {
    missing: "Index has not started",
    syncing: "Indexing repository…",
    ready: `${index?.sourceCount ?? 0} indexed excerpts`,
    stale: "Repository index needs a sync",
    failed: "Repository sync failed",
  }[index?.state ?? "missing"];

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
      <span role="status" className="text-[#7a7268]">{error || label}</span>
      <button type="button" disabled={refreshing || syncing} onClick={() => void refresh()}
        className="rounded-lg border border-[#ead9c8] px-3 py-2 font-semibold disabled:opacity-60">
        Sync repository
      </button>
    </div>
  );
}
