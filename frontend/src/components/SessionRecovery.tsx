export function SessionRecovery({ onRetry }: { onRetry: () => Promise<unknown> }) {
  return (
    <main className="rv-auth-page p-6">
      <div className="text-center">
        <p role="alert">Couldn’t check your session. The server may still be waking up.</p>
        <button className="mt-4 rounded-lg border px-4 py-2" type="button"
          onClick={() => void onRetry()}>
          Retry session check
        </button>
      </div>
    </main>
  );
}
