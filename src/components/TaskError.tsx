// Callers provide task-specific, credential-redacted text. Never pass request
// objects or raw serialized errors through this presentation component.
export function TaskError({
  summary,
  detail,
  onRetry,
  busy = false,
}: {
  summary: string;
  detail: string;
  onRetry?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="task-error">
      <p role="alert">{summary}</p>
      {detail.trim() && (
        <details>
          <summary>Details</summary>
          <pre>{detail}</pre>
        </details>
      )}
      {onRetry && (
        <button type="button" disabled={busy} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
