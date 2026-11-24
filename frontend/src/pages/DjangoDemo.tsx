import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

type Vault = {
  slug: string;
  name: string;
  sources: { id: number; title: string; filename: string }[];
};

type Answer = {
  answer: string;
  sources: { title: string; page: number; text: string }[];
};

export function DjangoDemo() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [vaultSlug, setVaultSlug] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const currentVault = vaults.find((vault) => vault.slug === vaultSlug);

  useEffect(() => {
    const controller = new AbortController();
    async function loadVaults() {
      try {
        const response = await fetch("/api/demo/vaults/", { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load vaults");
        const data: Vault[] = await response.json();
        setVaults(data);
        setVaultSlug(data[0]?.slug ?? "");
      } catch {
        if (!controller.signal.aborted) setError("Could not load vaults. Check that the Django demo is running.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadVaults();
    return () => controller.abort();
  }, []);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vaultSlug || !question.trim()) return;

    setAsking(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/demo/vaults/${encodeURIComponent(vaultSlug)}/ask/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      if (!response.ok) throw new Error("Question failed");
      setResult(await response.json());
    } catch {
      setError("Could not answer the question. Check the Django demo and try again.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link to="/" className="text-sm font-medium text-amber-900 underline">Back to ReszVault</Link>
        <h1 className="text-3xl font-semibold">ReszVault Django demo</h1>
        {loading && <p role="status">Loading vaults…</p>}
        {error && <p role="alert" className="text-red-800">{error}</p>}
        {!loading && !error && vaults.length === 0 && (
          <p>No sample vaults yet. Run the <code>seed_demo</code> Django command.</p>
        )}
        {vaults.length > 0 && (
          <form className="space-y-4 rounded-xl border border-stone-200 bg-white p-5" onSubmit={ask}>
            <label className="block space-y-1">
              <span className="block text-sm font-medium">Vault</span>
              <select
                className="w-full rounded-md border border-stone-300 p-2"
                value={vaultSlug}
                disabled={asking}
                onChange={(event) => {
                  setVaultSlug(event.target.value);
                  setResult(null);
                  setError("");
                }}
              >
                {vaults.map((vault) => <option key={vault.slug} value={vault.slug}>{vault.name}</option>)}
              </select>
            </label>
            {currentVault && (
              <p className="text-sm text-stone-600">
                PDFs: {currentVault.sources.map((source) => source.filename).join(", ") || "None"}
              </p>
            )}
            <label className="block space-y-1">
              <span className="block text-sm font-medium">Question</span>
              <input
                className="w-full rounded-md border border-stone-300 p-2"
                value={question}
                maxLength={500}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What is the return window?"
                required
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-amber-800 px-4 py-2 text-white disabled:opacity-50"
              disabled={asking || !question.trim()}
            >
              {asking ? "Searching…" : "Ask"}
            </button>
          </form>
        )}
        {result && (
          <section aria-labelledby="vault-answer" className="space-y-3 rounded-xl border border-stone-200 bg-white p-5" aria-live="polite">
            <h2 id="vault-answer" className="text-lg font-semibold">Answer</h2>
            <p className="whitespace-pre-line">{result.answer}</p>
            {result.sources.length > 0 && (
              <ul aria-label="Sources" className="list-disc pl-6 text-sm text-stone-600">
                {result.sources.map((source, index) => (
                  <li key={index}>{source.title}, page {source.page}</li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
