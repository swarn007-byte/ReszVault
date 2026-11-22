import { useEffect, useState, type FormEvent } from "react";
import { startGitHubSignIn } from "../lib/auth-client";
import { authorizeRepository, getGitHubAccess, githubError } from "../api/github";

export function RepositoryPicker({ onSelect }: { onSelect: (repository: string) => void }) {
  const [repository, setRepository] = useState("");
  const [installationUrl, setInstallationUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    getGitHubAccess()
      .then((url) => { if (active) setInstallationUrl(url); })
      .catch((failure: unknown) => { if (active) setError(githubError(failure)); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      onSelect(await authorizeRepository(repository));
    } catch (failure) {
      setError(githubError(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-2xl font-semibold">Start a repository chat</h1>
      <p className="mt-2 text-sm">Choose a GitHub repository to search its code, docs, pull requests, and issues.</p>
      <div className="my-4 flex flex-wrap gap-4 text-sm underline">
        <button type="button" className="underline"
          onClick={() => void startGitHubSignIn().catch((failure: Error) => setError(failure.message))}>
          Sign in with GitHub
        </button>
        {installationUrl && <a href={installationUrl} target="_blank" rel="noreferrer">Grant repository access on GitHub</a>}
      </div>
      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1">
          GitHub repository
          <input className="rounded-lg border border-[#e8ddd0] bg-white p-3" value={repository}
            onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" required />
        </label>
        <button className="rounded-lg bg-[#242731] p-3 text-white" type="submit" disabled={pending}>
          {pending ? "Checking access…" : "Start chat"}
        </button>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      </form>
    </div>
  );
}
